import sha1 from 'sha1';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }

    const users = dbClient.db.collection('users');

    await users.findOne({ email }, (err, result) => {
      if (result) {
        res.status(400).json({ error: 'Already exist' });
      } else {
        const hashedPwd = sha1(password);
        users.insertOne({ email, password: hashedPwd }).then((user) => {
          res.status(201).json({ id: user.insertedId, email });
        });
      }
    });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const users = dbClient.db.collection('users');
    const objectId = new ObjectID(userId);
    await users.findOne({ _id: objectId }, (err, result) => {
      if (!result) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ id: userId, email: result.email });
    });
  }
}

module.exports = UsersController;
