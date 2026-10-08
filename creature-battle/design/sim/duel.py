"""1v1 mirror-type duels across all 146 legal stat builds: shows how much each stat point is worth.
Usage: python3 duel.py <ruleset> [defensive move]   e.g. python3 duel.py v4 heal"""
import random, sys, collections
from engine import RULES, Battle, Greedy, all_builds

rs = sys.argv[1] if len(sys.argv) > 1 else 'v4'
r = RULES[rs]
dm = sys.argv[2] if len(sys.argv) > 2 else 'heal'
basic, power = list(r['basic'])[0], list(r['power'])[0]
builds = all_builds(); rng = random.Random(4)
wins = collections.Counter(); games = collections.Counter()
for i, a in enumerate(builds):
    for b in builds[i + 1:]:
        for _ in range(2):
            ta = [dict(type='Water', stats=a, moves=(basic, power, dm))]
            tb = [dict(type='Water', stats=b, moves=(basic, power, dm))]
            res = Battle(ta, tb, r, Greedy(rng), Greedy(rng), rng).run()
            games[a] += 1; games[b] += 1
            if res['winner'] is None: wins[a] += .5; wins[b] += .5
            else: wins[(a, b)[res['winner']]] += 1
wr = {x: wins[x] / games[x] for x in builds}
top = sorted(wr.items(), key=lambda kv: -kv[1])
print(rs, dm, 'best', [(t, round(v, 2)) for t, v in top[:3]], 'worst', [(t, round(v, 2)) for t, v in top[-2:]])
for si, n in enumerate('HADS'):
    by = collections.defaultdict(list)
    for x, v in wr.items(): by[x[si]].append(v)
    print('  ', n, ' '.join('%d:%.2f' % (l, sum(by[l]) / len(by[l])) for l in range(6)))
