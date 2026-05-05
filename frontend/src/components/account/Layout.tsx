// src/components/account/Layout.tsx
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Header from "../Header";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";

type LayoutProps = {
  token: string | null;
  setToken: (token: string | null) => void;
  theme: string;
  onThemeChange: (theme: string) => void;
  onLanguageChange: (lang: string) => void;
  currentLanguage: string;
};

const Layout = ({ token, setToken, theme, onThemeChange, onLanguageChange, currentLanguage }: LayoutProps) => {
  // state lưu item đang chọn
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);

  // Hàm gọi API để lấy số dư khả dụng từ backend
  const fetchAvailableBalance = useCallback(async () => {
    if (!token) {
      setAvailableBalance(null);
      return;
    }

    try {
      const res = await axios.get("/api/orders/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextAvailable = typeof res.data?.available === "number" ? res.data.available : 0;
      setAvailableBalance(nextAvailable);
    } catch (err) {
      console.error("Lỗi tải số dư khả dụng:", err);
    }
  }, [token]);

  // Update theme khi prop thay đổi
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // Gọi API lấy số dư khi token thay đổi
  useEffect(() => {
    void fetchAvailableBalance();
  }, [fetchAvailableBalance]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* HEADER */}
      <Header
        token={token}
        setToken={setToken}
        availableBalance={availableBalance}
        onDepositSuccess={fetchAvailableBalance}
        theme={theme}
        onThemeChange={onThemeChange}
        onLanguageChange={onLanguageChange}
        currentLanguage={currentLanguage}
      />

      {/* BODY */}
      <div style={{ display: "flex", flex: 1 }}>
        <Sidebar onSelect={setSelectedItem} />
        <MainContent selectedItem={selectedItem} />
      </div>
    </div>
  );
};

export default Layout;
