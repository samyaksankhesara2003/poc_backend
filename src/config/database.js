import knex from "knex";
import knexConfig from "./knexConfig.js";
import { Model } from "objection";

function dbSetup(){
    const db = knex(knexConfig);
    Model.knex(db);
    return db;
}
export default dbSetup;