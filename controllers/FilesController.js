const { ObjectId } = require('mongodb');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, type, parentId = 0, isPublic = false, data } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!type) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!data && type != 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    const file = {
      userId,
      name,
      type,
      parentId,
      isPublic
    };
    const files = dbClient.db.collection('files');

    if(parentId) {
      const idObject = ObjectId(parentId);
      const parent = await files.findOne({ _id: idObject });
      if (!parent) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parent.type != 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    if(type === 'folder') {
      const res = await files.insertOne(file);
      const [{
        _id, userId, name, type, parentId, isPublic
      }] = res.ops;
      res.status(201).json({
        _id, userId, name, type, parentId
      });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(folderPath, { recursive: true });
    const filePath = `${folderPath}/${uuidv4()}`;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    file.localPath = filePath;
    if(type !== 'folder') {
      const result = await files.insertOne(file);
      const [{
        name, _id, isPublic, userId, type, parentId
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId
      });
    }
  }
}

module.exports = FilesController;
