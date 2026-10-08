import random, sys, collections, json
from engine import *
def run(name, r, N=6000, seed=3):
    rng = random.Random(seed); builds = all_builds()
    B=list(r['basic']); P=list(r['power']); D=list(r['defense'])
    W=collections.defaultdict(lambda:[0,0]); agg=collections.Counter(); acts=[]
    for g in range(N):
        teams=[[dict(type=rng.choice(T),stats=rng.choice(builds),moves=(rng.choice(B),rng.choice(P),rng.choice(D))) for _ in range(3)] for _ in (0,1)]
        bt=Battle(teams[0],teams[1],r,Greedy(rng,noise=.1),Greedy(rng,noise=.1),rng); res=bt.run()
        acts.append(res['turns'])
        for k in ('ohko','hits','double_turns','switch_count'): agg[k]+=res[k]
        agg['timeout']+=res['timeout']; agg['draw']+= res['winner'] is None
        for side in (0,1):
            sc = .5 if res['winner'] is None else float(res['winner']==side)
            for m in bt.teams[side]:
                sp=m.spec
                for key in ['T:'+sp['type'],'B:'+sp['moves'][0],'P:'+sp['moves'][1],'D:'+sp['moves'][2]]+['S%d:%d'%(i,v) for i,v in enumerate(sp['stats'])]:
                    W[key][0]+=sc; W[key][1]+=1
                agg['mons']+=1; agg['basic_out']+= m.pp[m.basic]==0; agg['acted']+=m.actions
                agg['b_'+m.basic]+=1; agg['bo_'+m.basic]+= m.pp[m.basic]==0
        lead=[bt.teams[s][0] for s in (0,1)]
        if lead[0].S!=lead[1].S:
            f=0 if lead[0].S>lead[1].S else 1; agg['fl_g']+=1; agg['fl_w']+= res['winner']==f
    acts.sort()
    wr=lambda k: W[k][0]/W[k][1]
    print(f"== {name}: actions median {acts[len(acts)//2]} p90 {acts[int(len(acts)*.9)]} | OHKO/hit {agg['ohko']/agg['hits']:.3f} | double turns/battle {agg['double_turns']/N:.2f} | switches/battle {agg['switch_count']/N:.1f} | draws {agg['draw']/N:.3f} timeouts {agg['timeout']/N:.3f} | faster lead wins {agg['fl_w']/agg['fl_g']:.3f}")
    print('  types  ', ' '.join(f"{t}:{wr('T:'+t):.3f}" for t in T))
    print('  basic  ', ' '.join(f"{b}:{wr('B:'+b):.3f}(out {agg['bo_'+b]/agg['b_'+b]:.2f})" for b in B))
    print('  power  ', ' '.join(f"{p}:{wr('P:'+p):.3f}" for p in P))
    print('  defense', ' '.join(f"{d}:{wr('D:'+d):.3f}" for d in D))
    for i,n in enumerate('HADS'):
        print('  '+n, ' '.join(f"{v}:{wr('S%d:%d'%(i,v)):.3f}" for v in range(6)))
run(sys.argv[1], RULES[sys.argv[1]], N=int(sys.argv[2]) if len(sys.argv)>2 else 6000)
