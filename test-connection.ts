
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('--- Testing Connection ---');
    console.log('DB_TYPE:', process.env.DB_TYPE);
    try {
        const { dataProvider } = await import('./src/db/provider');
        const companies = await dataProvider.getCompanies();
        console.log('Successfully connected to Airtable!');
        console.log('Companies found:', companies.length);
        process.exit(0);
    } catch (error) {
        console.error('Connection failed:', error);
        process.exit(1);
    }
}

test();
