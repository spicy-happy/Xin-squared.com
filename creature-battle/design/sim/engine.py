"""Throwaway balance simulator used for the design review (see ../PLAN.md, section 4).
Rulesets: 'proposed' (original plan), 'codex' (Codex review values), 'v4' (Ruleset 1 draft), 'v5' (Playtest Ruleset 1).
The real engine will be creature-battle/src/engine.js; port this to tools/balance-sim.mjs, do not extend it."""
import random, itertools

T = ['Fire', 'Water', 'Grass', 'Electric', 'Ground', 'Flying']

def chart(strong, special=None, hi=1.5, lo=0.75):
    m = {(a, d): 1.0 for a in T for d in T}
    for a, ds in strong.items():
        for d in ds:
            m[(a, d)] = hi; m[(d, a)] = lo
    for k, v in (special or {}).items(): m[k] = v
    return m

CHART_PROP = chart({'Fire': ['Grass'], 'Water': ['Fire', 'Ground'], 'Grass': ['Water', 'Ground'],
                    'Electric': ['Water', 'Flying'], 'Ground': ['Fire', 'Electric'], 'Flying': ['Grass']},
                   {('Ground', 'Flying'): 0.75})
CHART_REC = chart({'Fire': ['Grass', 'Flying'], 'Water': ['Fire', 'Ground'], 'Grass': ['Water', 'Electric'],
                   'Electric': ['Water', 'Flying'], 'Ground': ['Fire', 'Electric'], 'Flying': ['Grass', 'Ground']})

RULES = {
    'proposed': dict(
        chart=CHART_PROP, hp_base=48, hp_per=6, atk_per=0.08, def_per=0.10,
        crit=1/16, crit_mult=1.25,
        basic={'steady': dict(pow=12, pp=16), 'quick': dict(pow=10, pp=24),
               'pierce': dict(pow=10, pp=12, pierce=0.5), 'heavy': dict(pow=15, pp=8)},
        power={'blast': dict(pow=26, pp=3, acc=.85), 'gamble': dict(pow=32, pp=3, acc=.70),
               'recoil': dict(pow=24, pp=3, acc=1, recoil=.25), 'overload': dict(pow=34, pp=2, acc=1, rest=True)},
        defense={'guard': dict(pp=3), 'heal': dict(pp=3, heal=.25), 'toughen': dict(pp=3, tough=.75)},
        guard_mult=0.25, guard_mode='next_or_expire', sturdy=False, recoil_can_ko=True,
        ko_replacement_acts=False, switch_limit=None, tie='per_round', shield=None,
    ),
}
R = dict(RULES['proposed'])
R.update(
    chart=CHART_REC, hp_base=60, hp_per=8, atk_per=0.10, def_per=0.10, crit_mult=1.5,
    basic={'steady': dict(pow=12, pp=20), 'quick': dict(pow=11, pp=20, speed_stat=True),
           'pierce': dict(pow=11, pp=20, pierce=1.0), 'heavy': dict(pow=15, pp=10, self_tired=False, heavy_hp=True)},
    power={'blast': dict(pow=26, pp=3, acc=.90), 'gamble': dict(pow=34, pp=3, acc=.75),
           'recoil': dict(pow=28, pp=3, acc=1, recoil=.25), 'overload': dict(pow=40, pp=2, acc=1, rest=True)},
    defense={'shield': dict(pp=3), 'heal': dict(pp=3, heal=.30), 'toughen': dict(pp=3, tough=.70)},
    shield=0.30, sturdy=True, recoil_can_ko=False, ko_replacement_acts=True, switch_limit=3, tie='per_pairing',
)
RULES['rec'] = R
CHART_CYCLE = chart({'Fire': ['Grass'], 'Grass': ['Ground'], 'Ground': ['Electric'], 'Electric': ['Flying'],
                     'Flying': ['Water'], 'Water': ['Fire']}, hi=1.25, lo=0.8)
C = dict(RULES['proposed'])
C.update(chart=CHART_CYCLE, hp_base=72, hp_per=6, atk_per=0.06, def_per=0.08, crit_mult=1.25,
    basic={'steady': dict(pow=12, pp=10), 'quick': dict(pow=10, pp=16), 'pierce': dict(pow=12, pp=6, pierce=1.0),
           'heavy': dict(pow=15, pp=4)},
    power={'blast': dict(pow=26, pp=3, acc=.90), 'gamble': dict(pow=28, pp=3, acc=.85),
           'recoil': dict(pow=26, pp=3, acc=1, recoil=.25), 'overload': dict(pow=34, pp=2, acc=1, rest=True)},
    defense={'guard': dict(pp=3), 'heal': dict(pp=3, heal=.20), 'toughen': dict(pp=3, tough=.80)},
    guard_mode='persist', round_limit=30)
RULES['codex'] = C


class Mon:
    def __init__(s, spec, rules):
        s.spec = spec; s.r = rules
        s.type = spec['type']; s.H, s.A, s.D, s.S = spec['stats']
        s.maxhp = rules['hp_base'] + rules['hp_per'] * s.H; s.hp = s.maxhp
        s.basic, s.power, s.dfn = spec['moves']
        s.pp = {s.basic: rules['basic'][s.basic]['pp'], s.power: rules['power'][s.power]['pp'],
                s.dfn: rules['defense'][s.dfn]['pp']}
        s.tough = False; s.guard = False; s.shield = 0; s.resting = False
        s.dmg_dealt = 0; s.actions = 0

    def alive(s): return s.hp > 0
    def leave(s): s.tough = False; s.guard = False; s.shield = 0


def raw_damage(r, att, dfn, move, kind, crit=False):
    m = r['basic'][move] if kind == 'basic' else r['power'][move]
    if m.get('first_pow') is not None and not getattr(att, 'first_now', False):
        m = dict(m, pow=m['first_pow'][1])
    elif m.get('first_pow') is not None:
        m = dict(m, pow=m['first_pow'][0])
    st = att.S if m.get('speed_stat') else att.A
    d = dfn.D * (1 - m.get('pierce', 0))
    dmg = m['pow'] * (1 + r['atk_per'] * st + r.get('spd_power', 0) * att.S) / (1 + r['def_per'] * d) * r['chart'][(att.type, dfn.type)]
    if crit: dmg *= r['crit_mult']
    if dfn.tough: dmg *= r['defense']['toughen']['tough']
    if dfn.guard: dmg *= r['guard_mult']
    return max(1, round(dmg))


class Battle:
    def __init__(s, teamA, teamB, rules, polA, polB, rng):
        s.r = rules; s.rng = rng
        s.teams = [[Mon(x, rules) for x in teamA], [Mon(x, rules) for x in teamB]]
        s.active = [0, 0]; s.pol = [polA, polB]; s.switches = [0, 0]
        s.turns = 0; s.pair_order = {}; s.log = []
        s.stats = dict(ohko=0, hits=0, double_turns=0, switch_count=0)

    def cur(s, side): return s.teams[side][s.active[side]]
    def bench(s, side): return [i for i, m in enumerate(s.teams[side]) if m.alive() and i != s.active[side]]
    def lost(s, side): return not any(m.alive() for m in s.teams[side])

    def order(s):
        a, b = s.cur(0), s.cur(1)
        if a.S != b.S: return [0, 1] if a.S > b.S else [1, 0]
        if s.r['tie'] == 'per_pairing':
            key = (id(a), id(b))
            if key not in s.pair_order: s.pair_order[key] = s.rng.random() < .5
            return [0, 1] if s.pair_order[key] else [1, 0]
        return [0, 1] if s.rng.random() < .5 else [1, 0]

    def legal(s, side):
        m = s.cur(side); acts = []
        if m.resting: return [('rest',)]
        if m.pp[m.basic] > 0: acts.append(('basic', m.basic))
        if m.pp[m.power] > 0: acts.append(('power', m.power))
        if not acts: acts.append(('struggle',))
        d = m.dfn
        if m.pp[d] > 0:
            ok = True
            if d == 'heal' and m.hp >= m.maxhp: ok = False
            if d == 'toughen' and m.tough: ok = False
            if d in ('guard',) and m.guard: ok = False
            if d == 'shield' and m.shield > 0: ok = False
            if ok: acts.append(('def', d))
        lim = s.r['switch_limit']
        if lim is None or s.switches[side] < lim:
            for i in s.bench(side): acts.append(('switch', i))
        return acts

    def hit(s, side, att, dfn, kind, move):
        r = s.r
        m = r['basic'][move] if kind == 'basic' else (r['power'][move] if kind == 'power' else dict(pow=6))
        if kind == 'struggle':
            dmg = max(1, round(6 * (1 + r['atk_per'] * att.A) / (1 + r['def_per'] * dfn.D)))
            crit = False
        else:
            if s.rng.random() >= m.get('acc', 1):
                dfn.guard = False
                return 0
            crit = s.rng.random() < r['crit'] + r.get('crit_per_speed', 0) * att.S
            dmg = raw_damage(r, att, dfn, move, kind, crit)
        if dfn.guard: dfn.guard = False
        if dfn.shield > 0:
            absorbed = min(dfn.shield, dmg); dfn.shield -= absorbed; dmg -= absorbed
        full = dfn.hp == dfn.maxhp
        actual = min(dfn.hp, dmg)
        if r['sturdy'] and full and actual >= dfn.hp: actual = dfn.hp - 1
        if full and actual >= dfn.maxhp: s.stats['ohko'] += 1
        s.stats['hits'] += 1
        dfn.hp -= actual; att.dmg_dealt += actual
        if m.get('recoil') and actual > 0:
            rc = max(1, round(actual * m['recoil']))
            if not r['recoil_can_ko']: rc = min(rc, att.hp - 1)
            att.hp -= rc
        if m.get('rest'): att.resting = 'pending'
        return actual

    def act(s, side, action):
        me, foe = s.cur(side), s.cur(1 - side)
        me.actions += 1
        k = action[0]
        s.stats.setdefault('use_' + k, 0); s.stats['use_' + k] = s.stats.get('use_' + k, 0) + 1
        if k == 'rest':
            me.resting = False; return
        if k == 'switch':
            me.leave(); s.active[side] = action[1]; s.switches[side] += 1; s.stats['switch_count'] += 1; return
        if k == 'struggle':
            s.hit(side, me, foe, 'struggle', None); return
        if k in ('basic', 'power'):
            me.pp[action[1]] -= 1; s.hit(side, me, foe, k, action[1])
            if me.resting == 'pending': me.resting = True
            return
        d = action[1]; me.pp[d] -= 1
        if d == 'heal': me.hp = min(me.maxhp, me.hp + round(me.maxhp * s.r['defense']['heal']['heal']))
        elif d == 'toughen': me.tough = True
        elif d == 'guard': me.guard = True; me.guard_set = s.turns
        elif d == 'shield': me.shield = round(me.maxhp * s.r['shield'])

    def replace(s, side):
        if s.lost(side): return
        s.active[side] = s.pol[side].replacement(s, side)

    def run(s, max_turns=400):
        last_actor = None; rounds = 0
        while s.turns < max_turns:
            rounds += 1
            if s.r.get('round_limit') and rounds > s.r['round_limit']: return s.result(timeout=True)
            order = s.order(); acted = set(); i = 0
            ko_end = False
            while i < len(order):
                side = order[i]; i += 1
                if not s.cur(side).alive(): continue
                if last_actor == side: s.stats['double_turns'] += 1
                me = s.cur(side)
                # proposed guard: expires at end of user's next turn
                if getattr(me, 'guard', False) and s.r['guard_mode'] == 'next_or_expire' and getattr(me, 'guard_set', -9) < s.turns - 1:
                    me.guard = False
                me.first_now = (len(acted) == 0)
                a = s.pol[side].choose(s, side)
                s.act(side, a); s.turns += 1; acted.add(side); last_actor = side
                for sd in (0, 1):
                    if s.lost(sd): return s.result()
                fainted = [sd for sd in (0, 1) if not s.cur(sd).alive()]
                if fainted:
                    for sd in fainted: s.replace(sd)
                    if s.r['ko_replacement_acts']:
                        # replacement takes the fainted creature's unused turn this round
                        continue
                    break  # proposed: replacements after the round; fainted creature's turn is lost
        return s.result(timeout=True)

    def result(s, timeout=False):
        la, lb = s.lost(0), s.lost(1)
        w = None if timeout or (la and lb) else (1 if la else 0)
        return dict(winner=w, turns=s.turns, timeout=timeout, **s.stats)


class Greedy:
    """Normal-AI style heuristic."""
    def __init__(s, rng, noise=0.0): s.rng = rng; s.noise = noise

    def ev(s, b, att, dfn, kind, move):
        r = b.r; m = r['basic'][move] if kind == 'basic' else r['power'][move]
        base = raw_damage(r, att, dfn, move, kind) - (dfn.shield if dfn.shield else 0) * 0.5
        e = max(0, base) * m.get('acc', 1)
        if m.get('rest'): e *= 0.6
        if m.get('recoil'): e *= 0.85
        return e, raw_damage(r, att, dfn, move, kind)

    def matchup(s, b, me, foe):
        c = b.r['chart']; return c[(me.type, foe.type)] / c[(foe.type, me.type)]

    def choose(s, b, side):
        acts = b.legal(side)
        if acts[0][0] == 'rest': return acts[0]
        if s.noise and s.rng.random() < s.noise: return s.rng.choice(acts)
        me, foe = b.cur(side), b.cur(1 - side)
        best, bs = None, -1e9
        for a in acts:
            k = a[0]
            if k in ('basic', 'power'):
                e, sure = s.ev(b, me, foe, k, a[1])
                sc = e
                if sure >= foe.hp:
                    sc = 100 + (5 if k == 'basic' else 0) + b.r['basic' if k == 'basic' else 'power'][a[1]].get('acc', 1) * 10
            elif k == 'struggle': sc = 3
            elif k == 'def':
                d = a[1]; frac = me.hp / me.maxhp
                if d == 'heal': sc = 14 if frac < .45 else (6 if frac < .7 else -5)
                elif d == 'toughen': sc = 13 if frac > .6 else 4
                elif d == 'guard': sc = 9 if frac < .6 else 5
                elif d == 'shield': sc = 13 if frac > .4 else 8
            elif k == 'switch':
                tgt = b.teams[side][a[1]]
                gain = s.matchup(b, tgt, foe) - s.matchup(b, me, foe)
                sc = -10 + 12 * gain if me.hp / me.maxhp > .25 else -10
            if sc > bs: bs, best = sc, a
        return best

    def replacement(s, b, side):
        foe = b.cur(1 - side)
        opts = b.bench(side) + ([b.active[side]] if b.cur(side).alive() else [])
        return max(opts, key=lambda i: (s.matchup(b, b.teams[side][i], foe), b.teams[side][i].hp))


class RandomPol(Greedy):
    def choose(s, b, side): return s.rng.choice(b.legal(side))


def all_builds(budget=10):
    return [x for x in itertools.product(range(6), repeat=4) if sum(x) == budget]

V2 = dict(RULES['rec'])
V2.update(hp_base=60, hp_per=6, atk_per=.10, def_per=.10, crit=.05, crit_per_speed=.05, crit_mult=1.5,
    basic={'steady': dict(pow=12, pp=12), 'quick': dict(pow=12, pp=12, first_pow=(14, 9)),
           'pierce': dict(pow=11, pp=10, pierce=1.0), 'heavy': dict(pow=15, pp=6)},
    power={'blast': dict(pow=26, pp=3, acc=.90), 'gamble': dict(pow=34, pp=3, acc=.75),
           'recoil': dict(pow=28, pp=3, acc=1, recoil=.25), 'overload': dict(pow=40, pp=2, acc=1, rest=True)},
    defense={'shield': dict(pp=3), 'heal': dict(pp=3, heal=.25), 'toughen': dict(pp=3, tough=.75)},
    shield=0.30, sturdy=True, recoil_can_ko=False, ko_replacement_acts=True, switch_limit=3, tie='per_pairing')
RULES['v2'] = V2

V3 = dict(RULES['v2'])
V3.update(hp_base=80, hp_per=8, crit=.04, crit_per_speed=.06,
    basic={'steady': dict(pow=12, pp=12), 'quick': dict(pow=12, pp=12, first_pow=(15, 10)),
           'pierce': dict(pow=11, pp=10, pierce=1.0), 'heavy': dict(pow=15, pp=6)},
    power={'blast': dict(pow=26, pp=3, acc=.90), 'gamble': dict(pow=32, pp=3, acc=.75),
           'recoil': dict(pow=30, pp=3, acc=1, recoil=.25), 'overload': dict(pow=40, pp=2, acc=1, rest=True)},
    defense={'shield': dict(pp=3), 'heal': dict(pp=3, heal=.25), 'toughen': dict(pp=3, tough=.70)})
RULES['v3'] = V3

V4 = dict(RULES['v3']); V4.update(ko_replacement_acts=False)
RULES['v4'] = V4
V4N = dict(V4); V4N.update(sturdy=False); RULES['v4_nosturdy'] = V4N
# v5 (= Playtest Ruleset 1, revised after the second design review): Health counts twice
# (Heal and the shield scale with max HP), so its per-point value drops; Quick 14/10 so it
# no longer strictly beats Heavy for a faster creature.
V5 = dict(V4); V5.update(hp_base=82, hp_per=7,
    basic=dict(V4['basic'], quick=dict(pow=12, pp=12, first_pow=(14, 10))))
RULES['v5'] = V5
