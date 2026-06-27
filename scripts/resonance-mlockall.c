/* ───────────────────────────────────────────────────────────────────────────
 * Resonance HiFi — mlockall LD_PRELOAD shim
 * ───────────────────────────────────────────────────────────────────────────
 * A tiny shared object injected via LD_PRELOAD into a core audio daemon (e.g.
 * CamillaDSP) that has no native memory-locking option. The constructor runs
 * before the host program's main(), calling mlockall() to pin every current
 * and future page of the process into physical RAM. This prevents the kernel
 * from paging the audio execution engine — or the audio chunks it is actively
 * processing — out to disk, eliminating page-fault stalls during playback.
 *
 * Build:
 *   gcc -shared -fPIC -O2 -o /usr/local/lib/resonance-mlockall.so \
 *       resonance-mlockall.c
 *
 * Use (systemd unit drop-in):
 *   [Service]
 *   LimitMEMLOCK=infinity
 *   Environment=LD_PRELOAD=/usr/local/lib/resonance-mlockall.so
 *
 * The call is intentionally best-effort: if RLIMIT_MEMLOCK is too low or the
 * lock is refused, mlockall() returns -1 and the host daemon simply runs
 * unlocked. The shim never aborts or interferes with the host process.
 * ─────────────────────────────────────────────────────────────────────────── */
#define _GNU_SOURCE
#include <sys/mman.h>

__attribute__((constructor))
static void resonance_mlock_init(void)
{
    /* MCL_CURRENT — lock all pages currently mapped.
     * MCL_FUTURE  — lock all pages mapped from now on (decode/DSP buffers). */
    (void) mlockall(MCL_CURRENT | MCL_FUTURE);
}
