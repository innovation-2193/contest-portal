import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const globalDb = globalThis as unknown as { contestPool?: mysql.Pool };
export const db = globalDb.contestPool ?? mysql.createPool({
  uri: url,
  connectionLimit: 10,
  enableKeepAlive: true,
  timezone: "+07:00",
  charset: "utf8mb4"
});
if (process.env.NODE_ENV !== "production") globalDb.contestPool = db;

export async function transaction<T>(work: (connection: mysql.PoolConnection) => Promise<T>) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
