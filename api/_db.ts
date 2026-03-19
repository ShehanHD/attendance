import { MongoClient, type Db } from 'mongodb'

let client: MongoClient | null = null

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI
  const database = process.env.MONGODB_DATABASE
  if (!uri) throw new Error('MONGODB_URI environment variable is not set')
  if (!database) throw new Error('MONGODB_DATABASE environment variable is not set')
  if (!client) {
    client = new MongoClient(uri)
    await client.connect()
  }
  return client.db(database)
}
