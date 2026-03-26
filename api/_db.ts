import { MongoClient, type Db } from 'mongodb'

let clientPromise: Promise<MongoClient> | null = null
let indexesEnsured = false

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI
  const database = process.env.MONGODB_DATABASE
  if (!uri) throw new Error('MONGODB_URI environment variable is not set')
  if (!database) throw new Error('MONGODB_DATABASE environment variable is not set')
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect()
  }
  const client = await clientPromise
  const db = client.db(database)
  if (!indexesEnsured) {
    indexesEnsured = true
    // Unique email index (sparse — allows multiple docs without email)
    await db.collection('employees').createIndex(
      { email: 1 },
      { unique: true, sparse: true, background: true }
    )
    // TTL: auto-delete WebAuthn challenges after 5 minutes
    await db.collection('webauthn_challenges').createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 300, background: true }
    )
  }
  return db
}
