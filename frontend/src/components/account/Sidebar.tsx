// src/components/account/Sidebar.tsx
import { useState } from "react";

type Props = {
  onSelect: (id: number) => void;
};

const Sidebar = ({ onSelect }: Props) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        width: collapsed ? "80px" : "260px",
        transition: "0.2s",
        background: "#111",
        color: "#fff",
        padding: "10px",
      }}
    >
      <button onClick={() => setCollapsed(!collapsed)} style={{ marginBottom: "20px", padding: "6px 10px" }}>
        {collapsed ? ">>" : "<<"}
      </button>

      {[1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          onClick={() => onSelect(item)} // 👈 click truyền lên Layout
          style={{
            padding: "10px",
            marginBottom: "5px",
            background: "#222",
            cursor: "pointer",
          }}
        >
          {collapsed ? `#${item}` : `Conversation ${item}`}
        </div>
      ))}
    </div>
  );
};

export default Sidebar;
