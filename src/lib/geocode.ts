/**
 * src/lib/geocode.ts
 * ==================
 * GPS 좌표 → 일반 주소 (역지오코딩).
 *
 * OSM Nominatim 공개 API 를 사용한다 (키 불필요, 한국어 지원).
 *   - 100m 이상 이동했을 때만 재조회 (rate limit 1req/s 준수)
 *   - 최소 조회 간격 20초
 *   - 오프라인/실패 시 null 반환 → UI 는 좌표로 폴백
 */
import { useEffect, useRef, useState } from 'react';

const MIN_INTERVAL_MS = 20000;

interface NominatimAddress {
  province?: string; state?: string; city?: string; county?: string;
  borough?: string; city_district?: string; suburb?: string;
  neighbourhood?: string; quarter?: string; village?: string;
  road?: string; house_number?: string;
}

/**
 * 행정구역 위주의 한국식 주소로 조합 (예: "경기 수원시 영통구 이의동 1333").
 * 상가명 등 POI 는 제외한다. 구성 요소가 없으면 display_name 폴백.
 */
function toKoreanAddress(addr: NominatimAddress | undefined, displayName: string): string {
  if (addr) {
    const parts = [
      addr.province ?? addr.state,
      addr.city ?? addr.county,
      addr.borough ?? addr.city_district,
      addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? addr.village,
      addr.road,
      addr.house_number,
    ].filter((s): s is string => !!s);
    if (parts.length >= 2) return parts.join(' ');
  }
  const parts = displayName.split(',').map((s) => s.trim())
    .filter((s) => s && s !== '대한민국' && !/^\d{4,6}$/.test(s));
  return parts.reverse().slice(0, 5).join(' ');
}

export function useAddress(lat: number | null, lon: number | null): {
  /** 변환된 주소. 아직 없으면 null */
  address: string | null;
  loading: boolean;
} {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastRef = useRef<{ lat: number; lon: number; at: number } | null>(null);

  // ~100m 격자로 반올림 — 이 값이 바뀔 때만 effect 가 다시 돈다
  const latKey = lat !== null ? Math.round(lat * 1000) : null;
  const lonKey = lon !== null ? Math.round(lon * 1000) : null;

  useEffect(() => {
    if (lat === null || lon === null) return;
    const last = lastRef.current;
    if (last && Date.now() - last.at < MIN_INTERVAL_MS) return;
    lastRef.current = { lat, lon, at: Date.now() };

    const ctrl = new AbortController();
    setLoading(true);
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}`
      + `&format=jsonv2&accept-language=ko&zoom=17`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { display_name?: string; address?: NominatimAddress }) => {
        if (j.display_name) setAddress(toKoreanAddress(j.address, j.display_name));
      })
      .catch(() => { /* 오프라인 등 — 기존 주소 유지 or null */ })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lonKey]);

  return { address, loading };
}
