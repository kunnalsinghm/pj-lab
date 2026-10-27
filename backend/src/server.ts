import "dotenv/config";
import { createApp } from "./app.ts";
const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => {
  console.log(`DeptFlow API running:  http://localhost:${port}`);
  console.log(`Health check:          http://localhost:${port}/api/health`);
});
