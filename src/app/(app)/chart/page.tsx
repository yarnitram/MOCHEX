import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChartWorkspaceClient } from "@/components/charts/chart-workspace-client";
import { cleanSymbol } from "@/lib/format";

interface Props {
  searchParams: Promise<{ symbol?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { symbol = "BTC_USDT" } = await searchParams;
  const cleanSym = cleanSymbol(symbol);
  return {
    title: `${cleanSym} Interactive Candlestick Chart Station | MOCHEX`,
    description: `Full-screen interactive MEXC Futures technical analysis workstation and live market stats for ${cleanSym}.`,
  };
}

export default async function ChartIndexPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { symbol = "BTC_USDT" } = await searchParams;
  return <ChartWorkspaceClient symbol={symbol} />;
}
