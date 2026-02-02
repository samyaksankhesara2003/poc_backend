import express from 'express';
import cors from 'cors';
import dbSetup from './config/database.js';
import pocRoutes from './routes/poc.routes.js';
const app = express();

dbSetup();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({origin: '*',credentials: true}));

app.use('/poc',pocRoutes)

export default app;