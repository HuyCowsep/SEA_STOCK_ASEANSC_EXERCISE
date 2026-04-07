// src/routes/datafeed.ts
// Proxy toàn bộ API datafeed & userdata từ ASEAN Securities
import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();
const BASE_URL = "https://seastock.aseansc.com.vn";

// ====================== DATAFEED ======================

/**
 * GET /api/datafeed/instruments?exchange=HOSE|HNX|UPCOM  hoặc  ?symbols=AAA,BBB
 * Lấy dữ liệu cổ phiếu theo sàn hoặc theo danh sách mã
 */
router.get("/instruments", async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${BASE_URL}/datafeed/instruments`, {
      params: req.query,
    });
    res.json(response.data);
  } catch (err) {
    console.error("Lỗi fetch instruments:", err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu instruments" });
  }
});

/**
 * GET /api/datafeed/instruments/:code
 * Lấy danh sách mã VN30, HNX30...
 */
router.get("/instruments/:code", async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const response = await axios.get(`${BASE_URL}/datafeed/instruments/${encodeURIComponent(code)}`);
    res.json(response.data);
  } catch (err) {
    console.error(`Lỗi fetch instruments/${req.params.code}:`, err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu instruments" });
  }
});

/**
 * GET /api/datafeed/m-instruments?exchange=...&board=G7
 * Lấy danh sách mã buy-in (mua ký quỹ)
 */
router.get("/m-instruments", async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${BASE_URL}/datafeed/m-instruments`, {
      params: req.query,
    });
    res.json(response.data);
  } catch (err) {
    console.error("Lỗi fetch m-instruments:", err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu m-instruments" });
  }
});

/**
 * GET /api/datafeed/indexsnaps/:codes
 * Lấy chỉ số thị trường (VN-INDEX, VN30, HNX, ...)
 * Ví dụ: /api/datafeed/indexsnaps/HOSE,30,HNX,HNX30,UPCOM
 */
router.get("/indexsnaps/:codes", async (req: Request, res: Response) => {
  try {
    const codes = req.params.codes as string;
    const response = await axios.get(`${BASE_URL}/datafeed/indexsnaps/${encodeURIComponent(codes)}`);
    res.json(response.data);
  } catch (err) {
    console.error("Lỗi fetch indexsnaps:", err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu indexsnaps" });
  }
});

/**
 * GET /api/datafeed/chartinday/:code
 * Lấy dữ liệu chart trong ngày (mini chart cho MarketIndexCards)
 */
router.get("/chartinday/:code", async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const response = await axios.get(`${BASE_URL}/datafeed/chartinday/${encodeURIComponent(code)}`);
    res.json(response.data);
  } catch (err) {
    console.error(`Lỗi fetch chartinday/${req.params.code}:`, err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu chart" });
  }
});

// ====================== USERDATA ======================

/**
 * GET /api/datafeed/industry
 * Lấy danh sách ngành (industry) để filter cổ phiếu theo ngành
 */
router.get("/industry", async (_req: Request, res: Response) => {
  try {
    const response = await axios.get(`${BASE_URL}/userdata/industry`);
    res.json(response.data);
  } catch (err) {
    console.error("Lỗi fetch industry:", err);
    res.status(500).json({ s: "error", message: "Không thể lấy dữ liệu ngành" });
  }
});

/**
 * GET /api/datafeed/time
 * Lấy server time (để hiển thị trạng thái thị trường)
 */
router.get("/time", async (_req: Request, res: Response) => {
  try {
    const response = await axios.get(`${BASE_URL}/userdata/time`);
    res.json(response.data);
  } catch (err) {
    console.error("Lỗi fetch time:", err);
    res.status(500).json({ s: "error", message: "Không thể lấy server time" });
  }
});

export default router;