/**
 * Putting a file in R2 from the browser, with progress.
 *
 * `fetch` cannot report upload progress — it resolves when the response
 * arrives and says nothing in between. For a 13 MB photograph on a phone that
 * is thirty seconds of a control that looks frozen, and a frozen control is one
 * people press again or navigate away from. `XMLHttpRequest` is the only API
 * that reports bytes sent, so it is what this uses.
 *
 * The content type has to be exactly what the URL was signed for. Anything else
 * and R2 rejects the *signature* rather than the file, which surfaces as a 403
 * with nothing in it to suggest the cause.
 */
export function putWithProgress(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("PUT", url, true)
    request.setRequestHeader("Content-Type", "application/pdf")

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        // The last progress event can arrive before the response does; without
        // this a finished file can sit at 98% while its task is already queued.
        onProgress(1)
        resolve()
      } else {
        reject(new Error(`R2 returned ${request.status}`))
      }
    }

    request.onerror = () => reject(new Error("The connection failed"))
    request.ontimeout = () => reject(new Error("The upload timed out"))
    request.onabort = () => reject(new Error("The upload was cancelled"))

    signal?.addEventListener("abort", () => request.abort(), { once: true })
    request.send(file)
  })
}

/**
 * Run `work` over `items`, `limit` at a time, in order.
 *
 * Deliberately not `Promise.all` over everything: fifty parallel PUTs from one
 * phone do not finish sooner in total, they just make all fifty look stalled at
 * once. Deliberately not sequential either, because a batch of fifty small
 * scans spends most of its time waiting rather than sending.
 *
 * Nothing rejects. A failure belongs to its own row — one bad file must not
 * abandon the forty-nine behind it — so `work` is expected to record its own
 * outcome and this only decides what runs when.
 */
export async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item === undefined) return
      await work(item, index)
    }
  })
  await Promise.all(runners)
}
