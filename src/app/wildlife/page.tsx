// src/app/wildlife/page.tsx #8
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function buildQueryString(searchParams: SearchParams | undefined) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.length > 0) {
          params.append(key, item);
        }
      }
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export default async function WildlifePage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const searchParams = props.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  redirect(`/wildlife/activity${buildQueryString(searchParams)}`);
}
