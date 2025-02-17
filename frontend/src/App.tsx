import Header from "./components/Header.tsx";
import Hero from "./components/Hero.tsx";
import DownloadVideo from "./components/DownloadVideo.tsx";

const App: React.FC = () => {
  return (
    <>
      <Header />
      <main className="px-6 my-12">
        <Hero />

        <div className="my-6">
          <DownloadVideo />
        </div>
      </main>
    </>
  );
};

export default App;
