import cluster from "cluster";
import os from "os";
import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Master ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  const app = express();
  const upload = multer({ dest: "uploads/" });

  app.post("/transcribe", upload.single("audio"), (req, res) => {
    const audioFilePath = req.file.path;
    const transcriptFilePath = `${audioFilePath}.json`;
    const webhookURL = req.body.webhookURL;

    exec(
      `whisper ${audioFilePath} --model tiny --output_format json --output_dir uploads/`,
      async (error) => {
        if (error) {
          res.status(500).send({ error: error.message });
        } else {
          const transcript = JSON.parse(fs.readFileSync(transcriptFilePath));

          if (webhookURL) {
            try {
              await fetch(webhookURL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(transcript),
              });
            } catch (error) {
              console.error(`Error sending webhook: ${error.message}`);
            }
          }

          res.send(transcript);
        }
      }
    );
  });

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}
