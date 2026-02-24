export default {
    client: "mysql2",
    connection: {
        host: 'localhost',
        user: 'root',
        password: 'Techuz@123',
        database: 'poc_db'
    },
    migrations: {
        directory: "../migrations"
    },
    seeds: {
        directory: "./src/seeds"
    }
};
