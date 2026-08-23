const db = require("./config/database");

async function testDatabase() {

    try {

        const [rows] =
            await db.execute("SELECT 1 AS test");

        console.log(
            "DATABASE CONNECTION SUCCESS"
        );

        console.log(rows);

        process.exit(0);

    } catch (error) {

        console.error(
            "DATABASE CONNECTION FAILED"
        );

        console.error(error);

        process.exit(1);

    }

}

testDatabase();