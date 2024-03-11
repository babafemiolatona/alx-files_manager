const express = require('express');
const router = require('./routes/index');

const port = process.env.PORT || 5000;

const app = express();

app.use(express.json());
app.use('/', router);

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

module.exports = app;
