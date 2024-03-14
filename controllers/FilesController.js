const { ObjectID } = require('mongodb');
const { uuidv4 } = require('uuid');
const fs = require('fs');
const mime = require('mime-types');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      name, type, parentId = '0', isPublic = false, data,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }

    const file = {
      userId: ObjectID(userId),
      name,
      type,
      parentId: parentId === '0' ? '0' : ObjectID(parentId),
      isPublic,
    };
    const files = dbClient.db.collection('files');

    if (parentId !== '0') {
      const idObject = ObjectID(parentId);
      const parent = await files.findOne({ _id: idObject });
      if (!parent) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (parent.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }

    if (type === 'folder') {
      const result = await files.insertOne(file);
      const [{
        _id, userId, name, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString, userId, name, type, parentId,
      });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(folderPath, { recursive: true });
    const filePath = `${folderPath}/${uuidv4()}`;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    file.localPath = filePath;
    if (type !== 'folder') {
      const result = await files.insertOne(file);
      const [{
        name, _id, isPublic, userId, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    }
  }

  static async getShow(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];

    if (token === undefined) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = await dbClient.client.db(dbClient.database).collection('files');
    const file = await filesCollection.findOne({ _id: ObjectID(fileId), userId: ObjectID(userId) });
    if (file === null) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];

    if (token === undefined) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const page = req.query.page || 0;
    const pageSize = 20;
    const skip = page * pageSize;
    const query = { userId: ObjectID(userId) };
    if (req.query.parentId !== undefined) {
      query.parentId = ObjectID(req.query.parentId);
    }

    const pipeline = [
      { $match: query },
      { $skip: skip },
      { $limit: pageSize },
    ];

    const filesCollection = dbClient.client.db(dbClient.database).collection('files');
    const userFiles = await filesCollection.aggregate(pipeline).toArray();

    const finalForm = [];
    for (const files of userFiles) {
      finalForm.push({
        id: String(files._id),
        userId: String(files.userId),
        name: files.name,
        type: files.type,
        isPublic: files.isPublic,
        parentId: (typeof files.parentId === 'object') ? String(files.parentId) : files.parentId,
      });
    }

    return res.json(finalForm);
  }

  static async putPublish(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];

    if (token === undefined) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (fileId === undefined) {
      return res.status(404).json({ error: 'Not found' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = await dbClient.client.db(dbClient.database).collection('files');
    const result = await filesCollection.updateOne(
      { _id: ObjectID(fileId) },
      { $set: { isPublic: true } },
    );

    if (result.modifiedCount !== 1) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await filesCollection.findOne({
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    });
    return res.status(200).json({
      id: String(file.id),
      userId: String(file.userId),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: (typeof file.parentId === 'object') ? String(file.parentId) : file.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];

    if (token === undefined) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (fileId === undefined) {
      return res.status(404).json({ error: 'Not found' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filesCollection = await dbClient.client.db(dbClient.database).collection('files');
    const result = await filesCollection.updateOne(
      { _id: ObjectID(fileId), userId: ObjectID(userId) },
      { $set: { isPublic: false } },
    );

    if (result.modifiedCount !== 1) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await filesCollection.findOne({
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    });
    return res.status(200).json({
      id: String(file.id),
      userId: String(file.userId),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: (typeof file.parentId === 'object') ? String(file.parentId) : file.parentId,
    });
  }

  static async getFile(request, response) {
    const { id } = request.params;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(id);
    files.findOne({ _id: idObject }, async (err, file) => {
      if (!file) {
        return response.status(404).json({ error: 'Not found' });
      }
      console.log(file.localPath);
      if (file.isPublic) {
        if (file.type === 'folder') {
          return response.status(400).json({ error: "A folder doesn't have content" });
        }
        try {
          let fileName = file.localPath;
          const size = request.param('size');
          if (size) {
            fileName = `${file.localPath}_${size}`;
          }
          const data = await fs.readFile(fileName);
          const contentType = mime.contentType(file.name);
          return response.header('Content-Type', contentType).status(200).send(data);
        } catch (error) {
          console.log(error);
          return response.status(404).json({ error: 'Not found' });
        }
      } else {
        const user = await FilesController.getUser(request);
        if (!user) {
          return response.status(404).json({ error: 'Not found' });
        }
        if (file.userId.toString() === user._id.toString()) {
          if (file.type === 'folder') {
            return response.status(400).json({ error: "A folder doesn't have content" });
          }
          try {
            let fileName = file.localPath;
            const size = request.param('size');
            if (size) {
              fileName = `${file.localPath}_${size}`;
            }
            const contentType = mime.contentType(file.name);
            return response.header('Content-Type', contentType).status(200).sendFile(fileName);
          } catch (error) {
            console.log(error);
            return response.status(404).json({ error: 'Not found' });
          }
        } else {
          console.log(`Wrong user: file.userId=${file.userId}; userId=${user._id}`);
          return response.status(404).json({ error: 'Not found' });
        }
      }
    });
  }
}

module.exports = FilesController;
