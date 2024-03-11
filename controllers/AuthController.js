const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const sha1 = require('sha1');

class AuthController {
  static async getConnect(req, res) {
    const auth = req.headers.authorization;
    if (!auth) {
      res.status(401).send('Unauthorized');
    }

    const [email, password] = Buffer.from(auth.split(' ')[1], 'base64').toString('utf-8').split(':');
    const user = await dbClient.db.collection('users').findOne({ email, password: sha1(password) });

    if (!user) {
      res.status(401).send('Unauthorized');
    }

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user._id.toString(), 86400);
    res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      res.status(401).send('Unauthorized');
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      res.status(401).send('Unauthorized');
    }

    await redisClient.del(`auth_${token}`);
    res.status(204).send('Disconnect');
  }
}

module.exports = AuthController;
