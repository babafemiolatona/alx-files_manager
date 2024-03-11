const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const sha1 = require('sha1');

class AuthController {
  static async getConnect(req, res) {
    const auth = req.header('Authorization').split(' ')[1];
    const [email, password] = Buffer.from(auth, 'base64').toString('ascii').split(':');
    if (!email || !password) {
      res.status(401).send('Unauthorized');
    }

    const users = dbClient.db.collection('users');
    const hashPassword = sha1(password);
    const user = await users.findOne({ email, password: hashPassword });

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
