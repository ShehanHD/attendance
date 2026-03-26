// Deletes all attendance entries from 2026-03-01 onwards.
// Run once: node scripts/clear-from-march.mjs
import { MongoClient } from 'mongodb'
import 'dotenv/config'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DATABASE ?? 'attendance'

if (!uri) {
  console.error('MONGODB_URI not set')
  process.exit(1)
}

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db(dbName)
  const result = await db.collection('entries').deleteMany({
    date: { $gte: '2026-03-01' },
  })
  console.log(`Deleted ${result.deletedCount} entries from 2026-03-01 onwards.`)
} finally {
  await client.close()
}
