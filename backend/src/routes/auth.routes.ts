import { Router } from "express";
import {
  login,
  register,
  requestPasswordOtp,
  resetPasswordWithOtp,
  getMe,
  updateProfile,
  changePassword,
  getFavoriteLists,
  updateFavoriteLists,
} from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);
router.get("/favorites", authMiddleware, getFavoriteLists);
router.put("/favorites", authMiddleware, updateFavoriteLists);
router.put("/profile", authMiddleware, updateProfile);
router.post("/change-password", authMiddleware, changePassword);
router.post("/forgot-password/request-otp", requestPasswordOtp);
router.post("/forgot-password/reset", resetPasswordWithOtp);

export default router;
