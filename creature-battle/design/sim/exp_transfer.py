"""Paired stat-transfer test: two mirrored teams (same types and moves), except that on every
creature the second team has moved `k` points from stat A to stat B. Reports the second team's
win rate for each ordered pair. 50% means the points are worth the same in either stat."""
import random, sys, itertools
from engine import *
def transfer(r, src, dst, N, seed=11, k=2):
    rng = random.Random(seed); builds = all_builds()
    B, P, D = list(r['basic']), list(r['power']), list(r['defense'])
    ok = [b for b in builds if b[src] >= k and b[dst] <= 5 - k]
    w = 0
    for g in range(N):
        t0, t1 = [], []
        for _ in range(3):
            b = rng.choice(ok); m = list(b); m[src] -= k; m[dst] += k
            ty = rng.choice(T); mv = (rng.choice(B), rng.choice(P), rng.choice(D))
            t0.append(dict(type=ty, stats=b, moves=mv)); t1.append(dict(type=ty, stats=tuple(m), moves=mv))
        if g % 2: w += Battle(t0, t1, r, Greedy(rng, .1), Greedy(rng, .1), rng).run()['winner'] == 1
        else:     w += Battle(t1, t0, r, Greedy(rng, .1), Greedy(rng, .1), rng).run()['winner'] == 0
    return w / N
name = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
for s, d in itertools.permutations(range(4), 2):
    if s < d: print(f"{name}: {'HADS'[s]}->{'HADS'[d]} {transfer(RULES[name], s, d, N):.3f}")
