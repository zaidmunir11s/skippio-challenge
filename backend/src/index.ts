import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Skippio backend listening on http://localhost:${PORT}`);
});
