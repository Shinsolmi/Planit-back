const express = require('express');
const cors = require('cors');
const schedulesRouter = require('./routes/schedules');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const userRoutes = require('./routes/users');
app.use('/users', userRoutes);
app.use('/schedules', schedulesRouter);

app.get('/', (req, res) => res.send('PLANit Node.js 서버 실행 중'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

