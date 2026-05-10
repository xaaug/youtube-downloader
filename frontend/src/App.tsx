// import Header from "./components/Header";
import DownloadVideo from "./components/Download/DownloadVideo";

const App: React.FC = () => {
  return (
    <div className="app-root">
      {/* <Header /> */}
      <main className="main-content">
        <DownloadVideo />
      </main>
    </div>
  );
};

export default App;