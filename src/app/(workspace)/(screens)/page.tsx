import { HomeScreen } from "@/app/_components/home-screen";
export const dynamic = "force-dynamic";
/** 起動時の画面はホーム（続きに戻る画面）。自分の資料は /mine。 */
export default function IndexPage() {
  return <HomeScreen />;
}
