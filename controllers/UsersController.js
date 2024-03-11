const sha1 = require('sha1');
const dbClient = require('../utils/db');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).send('Missing email');
      return;
    }

    if (!password) {
      res.status(400).send('Missing password');
      return;
    }

    const users = dbClient.db.collection('users');
    users.findOne({ email }, (err, user) => {
      if (user) {
        res.status(400).send('Already exist');
        return;
      }

      const newUser = {
        email,
        password: sha1(password)
      };

      users.insertOne(newUser).then((result) => {
        res.status(201).json({ id: result.insertedId, email });
      }).catch((err) => {
        console.log(err);
      });
    });
  }
}
module.exports = UsersController;
