import { app } from "./app.js";
import { config } from "./config.js";

// Start the HTTP server after the application and environment are configured.
app.listen(config.port, () => {
  console.log(`RootLore API running at http://localhost:${config.port}`);
});
