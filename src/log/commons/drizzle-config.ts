export default {
  schema: "src/log/commons/schema.ts",
  out: "src/log/commons/migrations",
  driver: 'better-sqlite',
  dbCredentials: {
    url: 'src/log/commons/logs.db',
  }
}