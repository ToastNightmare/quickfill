import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = APP_CONFIG.url;

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/editor`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/how-it-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/sign-in`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/sign-up`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
