// backend/src/server.ts

import express, { Request, Response } from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import datafeedRoutes from "./routes/datafeed";
import orderRoutes from "./routes/order.routes";
import depositRoutes from "./routes/deposit.routes";
import { startPolling } from "./socket/polling";
import { startMatchingEngine } from "./socket/matchingEngine";
import { connectDB } from "./config/database";

dotenv.config();
void connectDB();

const app = express();
const server = http.createServer(app);
const PORT = 3001;

// === Socket.IO — backend polling & broadcast ===
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  },
});

// Khởi động backend polling — backend tự poll ASEAN API và broadcast qua Socket.IO
startPolling(io);

// Khởi động mock matching engine — so sánh giá đặt vs giá thật, khớp lệnh
startMatchingEngine(io);

// Cho phép frontend (localhost:5173) gọi API
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/datafeed", datafeedRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/deposit", depositRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.send(`
    <html>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;">
        <div style="text-align:center;">
          <h1>🚀 Backend đang chạy</h1>
          <p>AseanSC Backend Server — Port ${PORT}</p>
        </div>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`✅ Backend server đang chạy tại http://localhost:${PORT}`);
});

export default app;
