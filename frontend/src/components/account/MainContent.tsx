// src/components/account/MainContent.tsx

type Props = {
  selectedItem: number | null;
};

const MainContent = ({ selectedItem }: Props) => {
  return (
    <div
      style={{
        flex: 1,
        padding: "20px",
        background: "#f5f5f5",
      }}
    >
      <h2>Main Content</h2>

      {selectedItem ? (
        <p>Bạn đang chọn Conversation #{selectedItem}</p>
      ) : (
        <p>Chưa chọn gì cả, click bên trái đi</p>
      )}
    </div>
  );
};

export default MainContent;