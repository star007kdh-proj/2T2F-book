# 한 사이클에 두 블록: 2-taken과 2-fetch 교과서

> 왜 frontend는 사이클마다 fetch block을 하나만 내보냈고, 어떻게 둘로 늘렸는가.

프로세서는 분기의 답이 나오기 전에 다음 명령을 가져온다. Kunminghu V3의 frontend는 이 일을 사이클마다 fetch block 하나 단위로 한다. 분기가 촘촘한 코드에서는 블록 하나에 명령어가 한두 개밖에 들어가지 않는다. backend는 8개를 받을 준비가 되어 있는데 frontend가 두 개를 건네는 사이클이 생긴다.

이 책은 그 간격을 어떻게 메웠는지를 다룬다. 2-taken은 한 사이클에 taken 분기 두 개를 예측한다. 2-fetch는 한 사이클에 fetch block 두 개를 캐시에서 꺼낸다. 두 기능은 따로 설계됐지만 함께 있어야 효과가 난다.

같은 내용을 발표 자료 형식으로 정리한 문서가 `docs/2T2F_INTRO_KR.md`에 있다. 이 책은 그 문서의 내용을 장 단위로 다시 쓴 것이다. 수치와 코드 위치는 두 문서가 같은 기준을 따른다.

## 이 책을 읽는 법

**대상.** Kunminghu V3 frontend 코드를 읽을 수 있는 팀원. BPU, FTQ, ICache, IFU라는 이름이 낯설지 않으면 충분하다.

**기준 코드.** 본문은 `feat/p3_2taken_backend_targetmem`을 기준으로 설명한다. 2-taken, 2-fetch, targetMem이 모두 들어 있는 브랜치다. 이후 브랜치에서 바뀐 파라미터나 게이트는 이 책의 범위 밖이다.

**실험.** 각 장에는 "실험"이 있다. 종이와 연필로 돌려 볼 수 있는 축소 모델이다. 실제 RTL의 측정값이 아니다. 실험마다 "설명용 모델"이라는 고지를 붙였고, 실측치는 조건과 함께 따로 표시한다.

**숫자.** 이 책은 숫자를 인용할 때 항상 조건을 함께 적는다. 조건이 다른 숫자끼리 순위를 매기지 않는다.

**그림.** 그림은 `docs/figures/` 아래에 있다. `gen_2t2f_figures.py`를 실행하면 다시 만들 수 있다. 캡션은 "그림 장-번호" 형식이다.

**고정 용어.** 책 전체에서 다음 이름을 쓴다.

| 이름 | 뜻 |
|---|---|
| 블록 A, B, C | taken 분기로 이어진 연속한 fetch block. A의 분기가 B로, B의 분기가 C로 간다 |
| BR1, BR2 | 블록 A의 첫 taken 분기, 블록 B의 첫 taken 분기 |
| pair | BR1과 BR2를 한 사이클에 함께 예측하는 것. pair fire는 그 예측이 실제로 나간 사이클 |
| fb0, fb1 | 한 번의 prefetch 또는 fetch 요청에 실린 첫 번째, 두 번째 fetch block |
| first, second | pair로 FTQ에 들어간 두 엔트리. first는 블록 A, second는 블록 B |

**읽는 순서.**

| 장 | 제목 | 질문 |
|---|---|---|
| 1 | 블록 하나로는 왜 부족한가 | 사이클당 명령어 공급량은 무엇이 정하는가 |
| 2 | 기존 frontend는 어떻게 움직이는가 | 예측과 fetch는 어디서 만나고 어디서 틀리는가 |
| 3 | 무엇을 바꿨나 | 열 곳의 변경을 한 장의 지도로 보기 |
| 4 | 2-taken | 예측기를 두 번 읽지 않고 분기 두 개를 어떻게 맞히는가 |
| 5 | 2-fetch | 캐시와 IFU가 블록 두 개를 어떻게 한 번에 다루는가 |
| 6 | 두 기능이 만나는 곳 | 따로 설계한 둘이 충돌하는 지점은 어디인가 |
| 7 | 숫자 읽는 법 | 얼마나 빨라지는가, 어떻게 재는가 |
| 8 | 종합 | 파라미터, 카운터, 한계, 파일 |

---

## 1장 · 블록 하나로는 왜 부족한가

frontend가 사이클마다 명령어를 몇 개 공급하는지는 fetch block의 크기가 정한다. 그런데 fetch block의 크기는 frontend가 정하지 않는다. 프로그램의 분기가 정한다.

**이 장에서 배우는 것**

* fetch block의 시작과 끝이 어떻게 정해지는지 설명할 수 있다.
* 사이클당 명령어 공급량의 상한과 하한을 계산할 수 있다.
* 2-taken과 2-fetch가 상한은 그대로 두고 하한만 올리는 이유를 말할 수 있다.

### fetch block은 어디서 끝나는가

fetch block은 2바이트 단위의 임의 주소에서 시작한다. 끝은 두 가지 중 먼저 오는 쪽이다. 첫 taken 분기가 있으면 거기서 끝난다. 없으면 시작 주소에 64바이트를 더한 뒤 32바이트 단위로 내림한 주소에서 끝난다.

그래서 블록 하나에 들어가는 명령어 수는 넓게 흔들린다.

| 경우 | 블록 크기 | C 확장 없음 (4바이트 명령어) | C 확장 있음 (2바이트 명령어 섞임) |
|---|---|---|---|
| 첫 명령어가 taken 분기 | 2 또는 4바이트 | 1개 | 1개 |
| taken 분기 없음, 시작 주소가 32바이트 정렬 | 64바이트 | 16개 | 최대 32개 |
| taken 분기 없음, 시작 주소가 정렬되지 않음 | 34~62바이트 | 9~15개 | 최대 31개 |

**그림 읽는 법.** 표의 첫 행이 문제다. 분기가 촘촘한 코드는 이 행에 가깝게 산다. 블록 하나에 명령어 하나가 들어가고, backend는 그 사이클에 하나만 받는다.

### 실험 1 · 공급량을 손으로 세기

**설명용 모델.** taken 분기가 평균 L개 명령어마다 하나씩 나오고, 명령어 크기는 평균 s바이트라고 가정한다. ICache miss와 redirect는 없다고 본다.

사이클당 공급량은 블록 수와 블록당 명령어 수의 곱이다.

| | 2-taken, 2-fetch 이전 | 2-taken, 2-fetch 이후 |
|---|---|---|
| 사이클당 블록 수 | 1 | 최대 2 |
| 사이클당 최소 명령어 수 (분기가 연속일 때) | 1 | 2 |
| 사이클당 최대 명령어 수 | 16 (C 확장 시 32) | 16 (C 확장 시 32) |
| decode로 넘어가는 수 | 사이클당 최대 8 | 사이클당 최대 8 |

상한이 그대로인 이유는 IFU가 한 사이클에 다루는 명령어 열이 64바이트, 곧 32 슬롯으로 고정되어 있기 때문이다. 두 블록은 크기 합이 64바이트 이하일 때만 2-fetch로 묶인다.

**해 볼 것.** L을 4로 놓고 사이클당 명령어 수를 계산해 보자. 이전에는 4개, 이후에는 최대 8개다. 이제 L을 20으로 놓자. 이전에도 블록 하나가 decode 폭 8을 채운다. 2-fetch는 묶이지도 않는다. 효과는 분기가 촘촘할 때만 나타난다.

### 두 기능은 왜 짝이어야 하는가

2-taken은 예측 쪽 대역폭을 늘린다. BPU가 한 사이클에 taken 분기 2개를 예측해 FTQ 엔트리 2개를 만든다. 2-fetch는 fetch 쪽 대역폭을 늘린다. ICache와 IFU가 한 사이클에 fetch block 2개를 처리한다.

예측만 빨라지면 FTQ에 엔트리가 쌓이기만 한다. fetch만 빨라지면 FTQ가 금방 비어 버린다. 큐의 양쪽 끝이 같은 속도로 움직여야 한다.

![그림 1-1](figures/fig01_concept.png)

**그림 1-1.** 기존 구조와 2-taken + 2-fetch의 블록 공급량 비교. 블록이 짧은 구간에서만 차이가 난다.

### 핵심 정리

1. fetch block은 첫 taken 분기에서 끝난다. 블록의 크기를 정하는 것은 frontend가 아니라 프로그램이다.
2. 사이클당 공급량의 상한은 64바이트로 그대로다. 2-taken과 2-fetch는 하한을 1블록에서 2블록으로 올린다.
3. 효과는 블록당 명령어가 1~4개인 구간에서 나타난다. 긴 블록은 원래 혼자서도 decode 폭을 채운다.
4. 예측과 fetch 중 한쪽만 빨라지면 FTQ가 넘치거나 마른다. 둘은 짝이다.

### 확인 퀴즈

1. 시작 주소가 32바이트 정렬이 아니고 taken 분기가 없는 블록의 크기 범위는?
2. 두 블록의 크기 합이 80바이트다. 2-fetch로 묶이는가?
3. backend 폭이 8인데 사이클당 최대 공급이 16이다. 상한을 늘리지 않은 선택이 합리적인 이유는?

<details><summary>답</summary>

1. 34~62바이트. 시작 주소 + 64바이트를 32바이트 단위로 내림하므로 정렬 오프셋만큼 줄어든다.
2. 묶이지 않는다. IFU의 명령어 열이 64바이트이므로 합이 64바이트 이하일 때만 2-fetch가 된다.
3. 긴 블록은 혼자서도 8을 채운다. 굶는 구간은 짧은 블록이 연속되는 곳이고, 그곳은 하한이 결정한다.

</details>

---

## 2장 · 기존 frontend는 어떻게 움직이는가

뒤 장을 읽는 데 필요한 만큼만 정리한다. 이미 아는 독자는 2.5절의 손실 사이클 표만 보고 넘어가도 된다.

**이 장에서 배우는 것**

* BPU 네 스테이지가 각각 무엇을 읽고 무엇을 쓰는지 말할 수 있다.
* FTQ의 포인터 네 개가 같은 큐 위에서 어떤 순서로 움직이는지 그릴 수 있다.
* 예측이 틀렸을 때 어디서 발견되는지에 따라 손실 사이클이 얼마나 달라지는지 계산할 수 있다.

![그림 2-1](figures/fig02_fe_baseline.png)

**그림 2-1.** 기존 frontend 스테이지 블록도.

### BPU는 어디서 빠르고 어디서 정확한가

BPU는 네 스테이지다. 빠른 예측과 정확한 예측이 다른 스테이지에서 나온다.

* **S0.** 다음에 예측할 블록의 시작 PC를 고르고 예측기 읽기를 시작한다.
* **S1.** uBTB, aBTB, uTAGE로 빠른 예측을 만들어 FTQ에 바로 기록한다. 이 target이 다음 사이클의 시작 PC가 된다.
* **S2.** mBTB, TAGE 등의 SRAM 읽기 결과를 모은다.
* **S3.** TAGE, SC, ITTAGE, RAS로 최종 예측을 만든다. S1 예측과 다르면 **override**가 발생하고 FTQ를 되감아 다시 쓴다.

여기서 하나를 기억해 두자. **예측기는 사이클당 블록 1개만 읽을 수 있다.** 2-taken 설계는 이 제약에서 출발한다.

### FTQ 위를 움직이는 네 포인터

FTQ는 64 엔트리 원형 큐다. 엔트리 하나가 fetch block 하나다. 포인터 네 개가 같은 큐 위를 순서대로 따라간다.

| 포인터 | 뜻 |
|---|---|
| bpuPtr | BPU가 다음 예측을 쓸 위치 |
| pfPtr | 다음에 ICache prefetch를 보낼 위치 |
| fetchPtr | 다음에 fetch를 보낼 위치 |
| commitPtr | backend가 commit을 마친 위치 |

엔트리 본체인 시작 PC와 taken 분기 위치는 S1에 기록된다. 예측기 meta는 같은 블록이 S3에 도달했을 때 기록된다. 한 엔트리가 두 번에 걸쳐 채워진다는 점이 뒤에서 중요해진다.

### ICache는 왜 두 번 조회하는가

* **PrefetchPipe.** FTQ의 pfPtr 엔트리를 받아 ITLB와 MetaArray를 조회한다. 어느 way에 있는지(waymask)를 WayLookup에 기록하고, miss면 MissUnit에 미리 요청한다.
* **WayLookup.** 32 엔트리 FIFO. PrefetchPipe가 구한 waymask를 MainPipe가 쓸 때까지 보관한다.
* **MainPipe.** FTQ의 fetchPtr 엔트리와 WayLookup의 waymask로 DataArray를 읽어 IFU에 넘긴다.

핵심은 주소 변환과 tag 비교를 prefetch 단계에서 미리 끝내 둔다는 점이다. MainPipe는 데이터만 읽는다.

### IFU는 무엇을 검사하는가

* **S0.** 명령어 경계를 찾고 유효 명령어를 앞으로 모은다(compact).
* **S1.** 블록 경계에 걸친 명령어를 이어 붙이고 PC를 만든다.
* **S2.** predecode로 예측을 검사한다. 틀리면 predecode redirect를 FTQ로 보낸다. 결과는 IBuffer에 들어간다.

### 실험 2 · 틀린 자리에 따라 손실 사이클 세기

![그림 2-2](figures/fig02b_pipeline_penalty.png)

**그림 2-2.** 파이프라인 스테이지와 경우별 손실 사이클. backend에 stall이 없다고 가정한다.

**설명용 모델.** FTQ, WayLookup, IBuffer가 비어 있고 backend가 막히지 않는다고 가정한다. 평소에는 이 큐들에 블록이 쌓여 있어 지연이 가려진다.

스테이지를 먼저 세자. frontend는 BP S0부터 IFU S2까지 7 스테이지다. BP S2와 S3은 fetch와 나란히 진행된다. S1 예측으로 먼저 fetch를 시작하고 S3이 뒤에서 검증하는 구조다. 분기는 Dec, Ren, Dis, Iss, RR, Bypass를 거쳐 Exe에서 풀린다. BP S0부터 세면 14번째 스테이지다.

손실은 "틀리지 않았다면 다음 명령어가 그 스테이지에 있었을 시점"과 비교한 값이다.

| 경우 | 손실 사이클 | 계산 |
|---|---|---|
| S1 예측이 맞음 | 0 | S1의 target이 같은 사이클에 다음 블록의 S0 PC가 된다 |
| S3 override | 2 | S3에 도달한 사이클에 S0 PC를 교정한다. 그사이 S1, S2에 들어온 뒤 블록 2개를 버린다 |
| predecode redirect | 6 | 전달 2사이클(IFU write back, FTQ) + BP S0에서 IFU S2까지 5사이클 − 1 |
| backend redirect | 13 | 전달 2사이클(Redirect gen, FTQ 도착) + BP S0에서 Exe까지 12사이클 − 1 |

**해 볼 것.** 표의 마지막 행을 보자. pair의 두 번째 분기 BR2는 S3 예측기를 거치지 않는다(4장). BR2가 틀리면 어느 행으로 떨어지는가. backend redirect, 13 사이클이다. 이 숫자가 4장에서 pair를 보수적으로 내는 이유가 된다.

**조건에 따라 달라지는 것.** 위 값은 기본 경로다. 다음 조건이 사이클을 더하거나 뺀다.

* prefetch bypass. redirect 다음 사이클에 FTQ가 target을 PrefetchPipe로 바로 보낸다. redirect가 연달아 오면 bypass가 나가지 않아 1사이클이 더해진다.
* ftqIdx 선행 전달. backend는 redirect보다 한 사이클 먼저 ftqIdx를 보낸다. ROB flush처럼 선행 전달이 없는 redirect는 1사이클이 더해진다.
* WayLookup bypass. WayLookup이 비어 있고 single prefetch일 때 PF S1과 MP S0이 같은 사이클에 진행된다.
* ITLB miss, ICache miss, backend의 operand 대기와 issue 경쟁은 그만큼 더해진다.

### 핵심 정리

1. S1은 빠르고 S3은 정확하다. S1 예측으로 fetch를 먼저 시작하고 S3이 뒤에서 검증한다.
2. 예측기는 사이클당 블록 1개만 읽는다. 이 제약이 2-taken 설계의 출발점이다.
3. FTQ 엔트리는 S1에 본체가, S3에 meta가 기록된다. 두 번에 걸쳐 채워진다.
4. 틀린 자리가 뒤로 갈수록 비싸다. S3 override 2, predecode 6, backend 13 사이클이다.

### 확인 퀴즈

1. S3 override가 버리는 블록은 몇 개이고 왜 그 수인가?
2. WayLookup이 없다면 MainPipe는 무엇을 더 해야 하는가?
3. backend redirect 손실이 13인데, 분기가 Exe에서 풀린 뒤 올바른 target 명령어가 Exe에 도달하는 것은 몇 번째 사이클인가?

<details><summary>답</summary>

1. 2개. S1과 S2에 들어온 뒤 블록이다. S3에 도달한 사이클에 S0 PC를 바꾸므로 그 둘만 버린다.
2. ITLB 조회와 MetaArray tag 비교. prefetch 단계가 미리 끝내 둔 것이 이 둘이다.
3. 14번째. 전달 2사이클과 BP S0에서 Exe까지 12사이클을 더한 값이다.

</details>

---

## 3장 · 무엇을 바꿨나

4장과 5장을 읽기 전에 변경 전체를 한 장으로 본다. 번호는 그림과 표에서 같다.

**이 장에서 배우는 것**

* 열 곳의 변경이 각각 2-taken, 2-fetch, 둘의 접점 중 어디에 속하는지 분류할 수 있다.
* 바뀌지 않은 것이 무엇인지 말할 수 있다.

![그림 3-1](figures/fig03_fe_2t2f.png)

**그림 3-1.** 2-taken과 2-fetch가 바꾼 부분. 번호는 아래 표와 대응한다.

| 번호 | 위치 | 변경 내용 | 장·절 |
|---|---|---|---|
| 1 | BPU S0 | pair fire 때 시작 PC가 BR2 target(블록 C)으로 바로 넘어간다 | 4.4 |
| 2 | BPU S1 | uBTB 엔트리에 slot2 추가. emit gate가 pair 발화 여부를 정한다 | 4.2~4.4 |
| 3 | 분기 history | pair 1회의 결과가 single 2회와 같아지도록 갱신한다 | 4.6 |
| 4 | FTQ enqueue | 한 사이클에 엔트리 2개를 쓰고 bpuPtr를 2 올린다 | 4.5 |
| 5 | FTQ 발행 | pfPtr와 fetchPtr가 한 번에 2씩 진행할 수 있다. 안전거리 guard 추가 | 5.2 |
| 6 | PrefetchPipe | 요청 하나에 블록 2개. MetaArray 2포트를 나눠 쓴다 | 5.3 |
| 7 | WayLookup | 한 사이클에 2개 쓰고 2개 읽는다 | 5.4 |
| 8 | MainPipe | req(0), req(1) 두 블록을 함께 처리한다 | 5.4 |
| 9 | IFU | 두 블록의 명령어를 하나의 열로 합친다 | 5.5 |
| 10 | Backend | pcMem에 두 번째 write port 추가. 예측 target 전용 targetMem 추가 | 6.3 |

**바뀌지 않은 것.** aBTB, uTAGE, mBTB, TAGE, SC, ITTAGE의 내부 구조. IBuffer와 backend 실행 경로. 특히 S2, S3 예측기에 두 번째 읽기 포트를 달지 않았다. 4장의 Limited 정책이 그 이유다.

![그림 3-2](figures/fig04_single_vs_pair.png)

**그림 3-2.** single 예측과 pair 예측의 FTQ 공급 비교. BPU 쪽에서만 본 2-taken의 효과다.

### 핵심 정리

1. 변경은 1~4(2-taken), 5~9(2-fetch), 10(접점)으로 나뉜다.
2. 예측기 내부와 backend 실행 경로는 그대로다. 바뀐 것은 블록을 세고 옮기는 쪽이다.

---

## 4장 · 2-taken: 예측기를 두 번 읽지 않고 분기 두 개를 맞히기

예측기는 사이클당 블록 하나만 읽는다. 그런데 한 사이클에 taken 분기 두 개를 예측해야 한다. 두 번째 분기는 어디서 오는가.

답은 **첫 번째 블록의 uBTB 엔트리 안에 두 번째 분기를 미리 적어 두는 것**이다. 블록 A를 조회할 때 BR1과 함께 BR2가 나온다. 블록 B는 BPU 파이프라인을 지나지 않는다.

**이 장에서 배우는 것**

* 블록 B가 예측기를 거치지 않는다는 사실에서 slot별 허용 타입이 어떻게 정해지는지 유도할 수 있다.
* uBTB가 pair를 어떻게 배우고, 어떤 조건에서 즉시 버리는지 설명할 수 있다.
* pair fire 사이클에 FTQ, history, aBTB에서 일어나는 일을 순서대로 말할 수 있다.
* "pair 1회 = single 2회"라는 불변식이 왜 필요하고 어디서 지켜지는지 설명할 수 있다.

### 4.1 두 번째 분기는 무엇이어도 되는가

블록 B는 S3 예측기의 도움을 받지 못한다. 그러므로 BR2는 **S3 없이도 맞힐 수 있는 분기**여야 한다. 이 한 문장에서 slot별 허용 타입이 나온다.

| | 허용 | 제외 | 이유 |
|---|---|---|---|
| slot A (BR1) | conditional, direct jump, direct call | return, indirect | 블록 A는 S3까지 정상 검증된다. 다만 return과 indirect는 target이 매번 달라 pair의 전제가 흔들린다 |
| slot B (BR2) | direct jump, conditional | call, return, indirect | 블록 B는 RAS, ITTAGE, TAGE를 읽지 못한다. conditional은 항상 taken인 것만 대상으로 하고 문턱을 높인다 |

BR2가 틀리면 backend redirect로만 교정된다. 2장 실험 2의 13 사이클이다. 그래서 pair는 보수적으로 낸다. 이 정책 덕분에 S2, S3 예측기에 두 번째 읽기 포트를 달지 않아도 된다. 이것을 **Limited 2-taken**이라 부른다.


### 4.2 uBTB 엔트리에 자리를 하나 더 만들기

![그림 4-1](figures/fig05_ubtb_entry.png)

**그림 4-1.** uBTB 엔트리 구조. slot1이 BR1, slot2가 BR2다.

uBTB는 64 엔트리 fully associative 레지스터 배열이다. 조합 논리로 같은 사이클에 결과가 나온다. 엔트리의 slot1에 BR1, slot2에 BR2를 저장한다. 엔트리 하나는 92비트다. attribute는 branchType 2비트와 rasAction 2비트, confidence는 4비트다.


블록 B의 시작 PC는 slot1의 target과 같다. 따로 저장하지 않는다. tag가 맞으면 slot1은 기존 single 예측으로 나가고, slot1과 slot2 묶음은 별도 출력(pairPrediction)으로 나간다.

한 가지 검사가 lookup 단계에 들어 있다. BR2 위치가 블록 B의 페이지를 넘어가면 pair 출력을 내지 않는다. ICache가 페이지를 넘는 블록을 받지 않기 때문이다. 블록 B는 BPU의 페이지 절단 로직을 지나지 않으므로 여기서 직접 막아야 한다(6.2).

### 4.3 pair는 어떻게 배우는가

학습 입력은 **fastTrain**이다. S3 최종 예측으로 uBTB를 바로 학습시키는 기존 경로다. 연속한 두 fastTrain이 다음을 모두 만족하면 **chain**으로 본다.

1. 앞 블록의 예측이 taken이다.
2. 뒤 블록의 시작 PC가 앞 블록의 target과 같다.
3. 두 블록의 시작 PC가 서로 다르다. 자기 자신으로 도는 루프는 제외한다.
4. 앞 분기가 return이나 indirect가 아니다.
5. 앞 블록의 uBTB 엔트리가 존재하고 slot1 내용이 앞 분기와 일치한다. tag aliasing을 막는다.

앞 블록 정보는 fastTrain이 비는 사이클에도 유지되고, redirect가 오면 지워진다. redirect를 사이에 둔 두 블록이 pair로 학습되는 일은 없다.

**slot2 갱신 규칙**

| 상황 | 동작 |
|---|---|
| chain이고 slot2가 비어 있다 | slot2에 BR2를 쓰고 confidence를 1로 둔다 |
| chain이고 slot2 내용(위치, 속성, target)이 같다 | confidence를 1 올린다 |
| chain이지만 slot2 내용이 다르다 | slot2를 즉시 무효화한다 |
| 뒤 블록이 not taken이거나 call, return, indirect다 | slot2를 즉시 무효화한다(fastTrainKill) |
| BR1 자체가 달라지거나 not taken으로 학습된다 | slot1을 다시 쓰고 slot2를 무효화한다(firstKill) |
| backend redirect가 pair second 엔트리에 떨어진다 | slot2를 즉시 무효화한다(mispKill) |

감소가 없다. 틀리면 바로 버린다. 이것을 **kill only**라 부른다. confidence의 뜻이 그래서 단순하다. "연속으로 몇 번 깨끗하게 확인됐는가"다. 불안정한 pair가 문턱 근처에서 오르내리며 계속 발화하는 일을 막는다. 무효화는 일반 엔트리 갱신보다 뒤에 적용되어 같은 사이클 충돌에서 항상 이긴다.

### 실험 3 · confidence를 따라가 보기

**설명용 모델.** 블록 A의 slot1은 이미 BR1로 채워져 있고, 문턱은 direct 2, conditional 4라고 놓는다. 한 줄이 fastTrain 한 쌍이다.

| 순서 | 뒤 블록의 결과 | slot2 | confidence | 발화 가능 (BR2 direct) |
|---|---|---|---|---|
| 1 | B, taken, direct | BR2 기록 | 1 | 아니오 |
| 2 | B, taken, direct | 유지 | 2 | 예 |
| 3 | B, taken, direct | 유지 | 3 | 예 |
| 4 | B, not taken | 무효화 | 0 | 아니오 |
| 5 | B, taken, direct | BR2 기록 | 1 | 아니오 |
| 6 | B, taken, direct | 유지 | 2 | 예 |

**해 볼 것.** 4번째 줄을 "confidence 1 감소"로 바꿔 보자. 3에서 2가 되고 pair는 계속 발화한다. 다음에 또 not taken이 나오면 1이 되어 멈추고, 그다음 taken에서 2가 되어 다시 발화한다. 문턱 근처에서 오르내리는 pair가 매번 13 사이클을 물어내는 모습이다. kill only가 이것을 끊는다.

**해 볼 것.** BR2를 conditional로 바꾸고 문턱 4를 적용해 보자. 2번째, 3번째 줄에서 발화하지 않는다. conditional의 문턱이 높은 이유는 S3 없이 방향을 맞혀야 하기 때문이다.

### 4.4 발화는 언제 하는가

블록 A가 S1에 있는 사이클에 `s1_usePair`가 다음을 모두 확인한다.

1. uBTB에서 pair가 hit한다.
2. confidence가 문턱 이상이다. BR2가 direct jump면 2, conditional이면 4다.
3. BR1이 taken 예측이고 slot A 허용 타입이다.
4. BR2가 slot B 허용 타입이다.
5. aBTB 출력이 없거나, 있으면 BR1의 위치, target, 속성이 uBTB와 일치한다.
6. fetch hungry 조건을 통과한다. FTQ에 prefetch 안 된 블록이 많이 쌓여 있으면 pair를 내지 않는 옵션이다. 기본값은 꺼져 있다.
7. 같은 사이클에 S3 override가 없다.

통과하면 같은 사이클에 세 가지가 함께 일어난다.

* FTQ로 가는 예측에 pair payload가 실린다. 블록 B의 시작 PC, BR2 위치, BR2 target이다.
* 다음 시작 PC가 BR2 target으로 선택된다. BPU는 블록 B를 건너뛰고 블록 C로 간다.
* history가 두 분기만큼 갱신된다.

![그림 4-2](figures/fig06_pair_fire_timing.png)

**그림 4-2.** pair fire 사이클 타이밍. S1 한 사이클에 FTQ 기록, 다음 PC 선택, history 갱신이 함께 일어난다.

![그림 4-3](figures/fig07_s1_pair_path.png)

**그림 4-3.** S1 pair 결정의 레지스터 경계 경로. 빨간 경로가 가장 길다.

**그림 읽는 법.** aBTB 출력에서 일치 비교를 거쳐 `s1_usePair`가 되고, 이것이 다음 시작 PC 선택으로 이어진다. 조건 5가 이 경로에 있다. 타이밍 개선은 `timing/2-taken-s1-pair` 브랜치에서 따로 다룬다.

### 4.5 FTQ에 두 칸을 한 번에 쓰기

![그림 4-4](figures/fig08_ftq_pair_slots.png)

**그림 4-4.** pair enqueue 때 두 엔트리에 기록되는 내용.

pair fire 사이클에 slot k와 slot k+1을 함께 쓰고 bpuPtr를 2 올린다. FTQ는 여유를 1칸 더 남겨 두어 2개 기록이 넘치지 않게 한다.

second 엔트리는 나중에 다른 엔트리를 참조하지 않아도 되도록 필요한 정보를 스스로 가진다.

* **isPairSecond 표시.** 어떤 enqueue든 그 자리를 다시 쓰면 지워진다.
* **pair first의 시작 PC.** uBTB에서 해당 엔트리를 찾아 무효화할 때 tag로 쓴다.
* **BR1까지만 반영된 redirect meta.** 4.6에서 설명한다.

second 엔트리는 S3 예측기의 resolve 학습을 하지 않는다. 이 블록은 예측기를 읽은 적이 없어 학습에 쓸 meta가 없다. S3 override가 발생하면 bpuPtr가 first 엔트리 다음으로 되돌아가고, second 엔트리는 다음 예측이 덮어쓴다. pair payload와 override는 같은 사이클에 함께 나올 수 없다. 발화 조건 7이 이를 보장한다.

### 4.6 pair 1회는 single 2회와 같아야 한다

지켜야 할 불변식은 하나다. **pair 1회의 결과는 single 2회의 결과와 비트 단위로 같아야 한다.** 같은 경로가 pair 여부에 따라 다른 history를 가지면 TAGE와 SC의 학습이 갈라진다. 같은 분기가 어떤 때는 이 history로, 어떤 때는 저 history로 학습되는 셈이다.

**PHR**

![그림 4-5](figures/fig09_phr_two_stage.png)

**그림 4-5.** PHR 2단 shift. BR1을 넣은 뒤 그 위에 BR2를 넣는다.

single 갱신은 분기 hash를 쓰고 포인터를 Shamt(2비트)만큼 옮긴다. pair 갱신은 한 사이클에 BR1 hash와 BR2 hash를 차례로 쓰고 포인터를 2·Shamt만큼 옮긴다. folded history도 같은 순서로 두 번 접는다. second 엔트리의 meta에는 두 단계 사이의 상태, 곧 포인터가 P − Shamt인 상태를 저장한다.

### 실험 4 · PHR을 손으로 두 번 밀기

**설명용 모델.** PHR을 8비트 원형 버퍼, Shamt를 2, 분기 hash를 2비트로 놓는다. 포인터 P는 다음에 쓸 위치다.

| 단계 | 동작 | 포인터 | second meta에 저장되는 것 |
|---|---|---|---|
| 시작 | | P | |
| single ×2, 1회차 | BR1 hash 기록 | P + 2 | |
| single ×2, 2회차 | BR2 hash 기록 | P + 4 | |
| pair ×1 | BR1 hash, 이어서 BR2 hash 기록 | P + 4 | P + 2 시점의 상태 |

**해 볼 것.** pair 쪽 결과와 single 2회 결과의 버퍼 내용을 비트 단위로 비교해 보자. 같아야 한다. 이제 second 엔트리에 redirect가 왔다고 하자. P + 2 상태로 되돌린 뒤 교정된 BR2를 single처럼 얹으면 P + 4가 된다. single 2회에서 2회차가 틀렸을 때와 같은 상태다.

**GHR, BW, IMLI**

이 셋은 SC가 쓰는 history다. GHR과 BW는 S3에서, IMLI는 S1에서 갱신된다. 블록 B는 S3에 가지 않으므로 그대로 두면 BR2가 history에서 빠진다.

* GHR, BW. 블록 A가 S3에 도달했을 때 BR2를 한 번 더 반영한다. override로 pair가 취소되면 반영하지 않는다.
* IMLI. pair fire 사이클에 두 번 step한다.

**RAS**

slot A에는 direct call이 올 수 있다. 이때 second 엔트리의 meta는 push가 끝난 뒤의 RAS 상태여야 한다. RasStack이 push 직후 상태를 그대로 내보내고, second 엔트리의 redirect meta와 commit meta가 이를 받는다. slot B는 call과 return을 허용하지 않으므로 push나 pop이 없다.

**redirect 복구**

* first 엔트리의 meta는 pair 이전 상태다. 일반 엔트리와 같다.
* second 엔트리의 meta는 BR1까지만 반영한 상태다.
* second 엔트리에 redirect가 오면 이 상태로 되돌린 뒤 교정된 BR2 결과를 일반 redirect처럼 얹는다. 결과는 single 2회와 같아진다.

### 4.7 aBTB의 끊어진 사슬

aBTB는 ahead 구조다. 블록을 처리하는 동안 다음 블록용 읽기를 한 사이클 먼저 시작한다. pair fire는 블록 B를 건너뛰므로 이 사슬이 한 번 끊긴다. pair fire 다음 사이클의 aBTB 출력은 블록 A 기준으로 읽은 값이라 블록 C에 맞지 않는다.

* **예측 억제.** 그 한 사이클은 aBTB 출력을 무시하고 uBTB 또는 fallthrough로 예측한다(`s1_abtbValidEffective`).
* **일관된 게이트.** emit gate, 일치 비교, PHR 입력이 모두 억제가 반영된 신호를 쓴다. 무시한 분기가 history에 들어가는 일이 없다.
* **학습 생략.** 블록 C가 S3에 도달했을 때 aBTB 학습을 하지 않는다. 그대로 학습하면 어떤 예측도 읽지 않는 자리에 엔트리가 만들어진다.

### 4.8 틀렸을 때 어디로 되돌아가는가

| 경우 | 처리 |
|---|---|
| 블록 A에 S3 override | bpuPtr를 되감아 두 엔트리를 모두 버린다. 교정된 예측으로 다시 진행한다 |
| first 엔트리에 backend redirect | 일반 redirect와 같다. pair 이전 meta로 복구한다 |
| second 엔트리에 backend redirect | isPairSecond로 식별한다. FTQ를 되감고, BR1까지 반영된 meta로 history를 복구하고, uBTB의 해당 slot2를 무효화한다 |
| second 엔트리에 predecode redirect | 위와 같다. mBTB 무효화 요청(pdInvalidate)은 보내지 않는다. 이 엔트리에는 mBTB meta가 없다 |

### 핵심 정리

1. 블록 B는 예측기를 지나지 않는다. 그래서 BR2는 S3 없이 맞힐 수 있는 분기(direct jump, 항상 taken인 conditional)로 제한한다.
2. pair는 uBTB 엔트리의 slot2에 산다. fastTrain의 연속한 두 블록이 chain 조건을 만족할 때 배운다.
3. 학습은 kill only다. 한 번이라도 어긋나면 바로 버리고, confidence는 연속 확인 횟수를 뜻한다.
4. pair fire 사이클에 FTQ 2칸 기록, 다음 PC를 블록 C로 선택, history 2단 갱신이 함께 일어난다.
5. pair 1회는 single 2회와 비트 단위로 같아야 한다. PHR 2단 shift, S3에서의 GHR·BW 보충, push 이후 RAS meta가 이를 지킨다.
6. second 엔트리는 자기 복구에 필요한 것을 스스로 가진다. isPairSecond, first의 PC, BR1까지의 meta다.

### 확인 퀴즈

1. slot B에서 call을 제외한 이유는 무엇인가?
2. second 엔트리에 predecode redirect가 왔을 때 pdInvalidate를 보내지 않는 이유는?
3. pair fire 다음 사이클에 aBTB 출력을 무시하는 이유는? 무시하지 않으면 어떤 일이 생기는가?
4. kill only 대신 감소 방식을 쓰면 무엇이 문제인가?

<details><summary>답</summary>

1. call은 RAS push가 필요하다. 블록 B는 S3을 지나지 않아 RAS를 갱신할 수 없고, 그러면 이후 return의 target이 틀린다.
2. 그 엔트리는 mBTB를 읽은 적이 없어 mBTB meta가 없다. 무효화할 대상을 특정할 수 없다.
3. ahead 구조라 그 출력은 블록 A 기준으로 읽은 값이고, 지금 S1에 있는 것은 블록 C다. 무시하지 않으면 틀린 분기가 예측과 history에 들어간다.
4. 문턱 근처에서 오르내리는 pair가 계속 발화하고, BR2가 틀릴 때마다 backend redirect 13 사이클을 물어낸다.

</details>

---

## 5장 · 2-fetch: 캐시와 IFU가 블록 두 개를 한 번에 다루기

이 장은 upstream의 2-fetch 구현을 기반으로 하고, 2-taken과 함께 쓰기 위한 수정을 더한 상태를 설명한다. 용어는 upstream ICache 설계 문서(V3)와 같다.

**이 장에서 배우는 것**

* 2-prefetch와 2-fetch가 왜 다른 것인지, 무엇이 둘을 분리하는지 설명할 수 있다.
* 안전거리 guard의 값을 직접 계산하고, 그것이 ICache와 IFU의 flush 검사를 단순하게 만드는 이유를 말할 수 있다.
* 두 블록이 MetaArray 두 포트에 들어맞는 경우와 그렇지 않은 경우를 판정할 수 있다.

### 5.1 prefetch 둘과 fetch 둘은 다른 것이다

* **2-prefetch.** PrefetchPipe가 한 요청으로 블록 2개의 waymask를 구해 WayLookup에 넣는다.
* **2-fetch.** MainPipe와 IFU가 한 요청으로 블록 2개의 명령어를 가져온다.

둘은 WayLookup으로 분리되어 있다. 2-prefetch로 함께 들어간 두 블록이 꼭 같은 2-fetch로 나올 필요는 없다. 반대로 따로 들어간 두 블록이 한 2-fetch로 나올 수도 있다.

![그림 5-1](figures/fig10_icache_2fetch_path.png)

**그림 5-1.** 2-prefetch와 2-fetch의 경로. WayLookup이 둘 사이의 완충이다.

### 5.2 FTQ는 언제 두 개를 내보내는가

**2-prefetch (`canTwoPrefetch`)**

1. bpuPtr와 pfPtr의 거리가 안전거리 guard보다 크다.
2. 두 블록이 같은 페이지에 있다. ITLB 포트를 하나만 쓰기 위함이다.
3. 두 블록 모두 backend가 알려 준 예외 대상이 아니다.
4. MetaArray 포트 충돌이 없다(5.3).

**2-fetch (`rawTwoFetchValid`)**

1. bpuPtr와 fetchPtr의 거리가 guard보다 크다.
2. 두 블록의 크기 합이 64바이트 이하다. IFU가 한 번에 다루는 명령어 열의 크기 제한이다.
3. 두 블록이 같은 페이지에 있다.
4. 두 블록 모두 backend 예외 대상이 아니다.

### 실험 5 · 안전거리 guard를 계산하기

![그림 5-2](figures/fig11_distance_guard.png)

**그림 5-2.** 안전거리 guard. 두 번째 블록이 S3 override 범위 밖에 있을 때만 2개를 내보낸다.

문제는 이것이다. BPU S3 override는 이미 FTQ에 들어간 엔트리를 다시 쓸 수 있다. 다시 쓰일 수 있는 엔트리를 두 번째 블록으로 내보내면 ICache와 IFU에서 "두 번째 블록만 취소"하는 처리가 필요해진다. 이를 피하려고 두 번째 블록이 override 범위 밖에 있을 때만 2개를 내보낸다.

**설명용 모델.** S2와 S3에 있는 예측이 FTQ에 넣은 엔트리 수를 각각 센다. 버블은 0, single은 1, pair는 2다.

guard = 1 + (S2 단계 예측이 넣은 엔트리 수) + (S3 단계 예측이 넣은 엔트리 수)

| S2에 있는 것 | S3에 있는 것 | guard |
|---|---|---|
| 버블 | 버블 | 1 |
| single | single | 3 |
| pair | single | 4 |
| pair | pair | 5 |

**해 볼 것.** bpuPtr − fetchPtr가 4일 때 각 행에서 2-fetch가 가능한지 판정해 보자. 거리가 guard보다 커야 하므로 첫 세 행은 가능하고 마지막 행은 불가능하다. pair가 연속이면 2-fetch 기회가 줄어든다. 6.1에서 다시 본다.

이 보장 덕분에 ICache와 IFU의 BPU flush 검사는 첫 번째 블록의 ftqIdx만 본다. 두 번째 블록은 override 대상이 될 수 없기 때문이다.

### 5.3 MetaArray 두 포트에 두 블록을 끼워 넣기

MetaArray는 set 인덱스의 짝수 bank와 홀수 bank로 나뉘어 있고 한 사이클에 각각 1개 line을 읽는다. 두 블록이 읽어야 할 line이 이 두 포트에 들어맞을 때만 2-prefetch가 가능하다.

![그림 5-3](figures/fig12_two_prefetch_case.png)

**그림 5-3.** 2-prefetch가 가능한 경우와 불가한 경우. 아래 두 행은 페이지 경계 제약이다.

### 실험 6 · 두 블록이 포트에 들어맞는가

**설명용 모델.** line은 64바이트, set 인덱스는 line 주소의 하위 비트라고 놓는다. 블록이 line 경계를 넘으면 연속한 line 두 개를 읽어야 하고, 연속한 두 line은 항상 홀짝이 다르다.

| 경우 | 조건 | 읽는 line |
|---|---|---|
| SameLine | 두 블록의 첫 line이 같다 | 그 line과 다음 line |
| Overlap1 | fb0이 line을 넘고, fb1이 그 다음 line 안에 있다 | fb0의 두 line |
| Overlap2 | fb1이 line을 넘고, fb0이 그 다음 line 안에 있다 | fb1의 두 line |
| Interleave | 둘 다 line을 넘지 않고, set 인덱스의 홀짝이 다르다 | 각자의 line |
| Conflict | 위에 해당하지 않는다 | fb0만 single prefetch |

**해 볼 것.** fb0이 line 10 안에 있고 fb1이 line 12 안에 있다고 하자. 둘 다 짝수다. Interleave가 아니고 다른 경우에도 해당하지 않으므로 Conflict다. fb1을 line 13으로 옮기면 Interleave가 된다. 이제 fb0을 line 10과 11에 걸치게 하고 fb1을 line 11 안에 두자. Overlap1이다. fb0이 읽는 두 line에 fb1이 이미 들어 있다.

PrefetchPipe S1은 두 포트의 읽기 결과를 경우에 맞게 두 블록에 나눠 준다(`generateReqMetaInfo`).

### 5.4 WayLookup과 MainPipe

**WayLookup write.** 2-prefetch면 한 사이클에 엔트리 2개를 쓴다. 두 번째 포트는 첫 번째 포트와 함께만 동작한다.

**WayLookup read.** fetch 요청이 오면 앞의 두 엔트리를 보고 실제로 2개를 내보낼지 정한다(`realTwoFetchValid`).

1. FTQ가 두 번째 블록을 유효로 보냈다(`rawTwoFetchValid`).
2. WayLookup에 엔트리가 2개 이상 있고 갱신 중이 아니다.
3. DataArray 읽기 충돌이 없다. 같은 bank의 같은 way를 서로 다른 set으로 읽는 경우가 충돌이다.
4. 두 블록 모두 MMIO가 아니고 ITLB 예외가 없다.

결정 결과는 FTQ로 돌아가 fetchPtr를 1 올릴지 2 올릴지 정한다. FTQ가 제안하고 WayLookup이 확정하는 구조다.

**MainPipe.** req(0)과 req(1)을 함께 처리해 IFU로 넘긴다. ITLB, PMP, ECC 예외는 블록별로 따로 표시한다. ITLB 예외가 난 2-prefetch는 WayLookup의 두 엔트리 모두에 예외 표시가 붙는다. 6.4의 hang 사례가 이 두 문장과 관련이 있다.

![그림 5-4](figures/fig13_2prefetch_2fetch_timing.png)

**그림 5-4.** 2-prefetch에서 2-fetch까지의 사이클 타이밍.

### 5.5 IFU는 두 블록을 하나의 열로 만든다

S0에서 두 블록의 명령어 경계를 한 번에 계산하고, 유효 명령어를 하나의 열로 모은다(InstrCompact). 각 명령어는 어느 블록 소속인지 표시를 가진다.

다음 경우에는 두 번째 블록을 S0에서 버린다.

* 첫 번째 블록의 taken 위치가 명령어 중간에 떨어진다. 예측이 틀린 경우다.
* 두 번째 블록에만 ICache 예외가 있다. 이 블록은 redirect로 혼자 다시 fetch되어 첫 번째 블록 자리에서 예외를 보고한다.

S2의 predecode 검사는 블록별로 수행한다. 어느 블록에서 틀렸는지에 따라 redirect의 ftqIdx가 정해진다.

### 5.6 flush 직후에는 어떻게 움직이는가

* **backend redirect와 predecode redirect.** 파이프라인과 WayLookup을 모두 비운다.
* **BPU S3 override.** 첫 번째 블록의 ftqIdx로만 판정한다. WayLookup은 맨 뒤 엔트리 1개만 되돌린다. 5.2의 guard가 두 번째 블록이 대상이 되지 않음을 보장한다.
* **bypass.** redirect 다음 사이클에는 BPU의 재예측을 기다리지 않고 redirect target을 바로 prefetch한다. 이때는 반드시 single prefetch로 보낸다. 엔트리 크기를 아직 모르므로 line을 넘는다고 가정한다.

### 핵심 정리

1. 2-prefetch와 2-fetch는 WayLookup으로 분리된 별개의 결정이다.
2. guard는 "S3 override가 되감을 수 있는 범위"다. 두 번째 블록을 그 밖에 둠으로써 ICache와 IFU는 첫 블록의 ftqIdx만 검사한다.
3. 2-prefetch는 MetaArray 홀짝 두 포트에 두 블록의 line이 들어맞을 때만 된다. 다섯 경우 중 Conflict만 single로 떨어진다.
4. 2-fetch의 최종 결정은 WayLookup이 한다. FTQ는 제안만 한다.
5. IFU는 두 블록을 한 열로 합치고, 검사와 예외는 블록별로 한다.

### 확인 퀴즈

1. 2-prefetch로 함께 들어간 두 블록이 2-fetch에서 갈라질 수 있는 이유는?
2. redirect 직후의 bypass prefetch를 single로만 보내는 이유는?
3. guard 공식에서 맨 앞의 1은 무엇을 뜻하는가?

<details><summary>답</summary>

1. 둘 사이에 WayLookup FIFO가 있고, 2-fetch 조건(크기 합 64바이트, DataArray 충돌, MMIO)은 2-prefetch 조건과 다르다.
2. 그 시점에는 엔트리 크기를 모른다. line을 넘는다고 가정해야 하므로 두 포트를 한 블록이 다 쓴다.
3. 지금 S1에서 쓰이고 있는 엔트리 자리다. S2, S3이 넣은 수에 그 1을 더한 범위가 override가 건드릴 수 있는 범위다.

</details>

---

## 6장 · 두 기능이 만나는 곳

2-taken과 2-fetch는 따로 설계됐다. 같은 FTQ 위에서 만나면서 서로를 제약하는 지점이 세 곳 있고, 그 접점에서 찾은 버그가 둘 있다.

**이 장에서 배우는 것**

* pair가 guard를 키우고 2-fetch 기회를 줄이는 이유를 말할 수 있다.
* 페이지 경계 검사가 BPU와 uBTB 두 곳에 있는 이유를 말할 수 있다.
* targetMem이 왜 필요했는지 pcMem의 stale 문제로 설명할 수 있다.

### 6.1 pair는 guard를 키운다

pair는 한 사이클에 엔트리 2개를 넣는다. 그러므로 S3 override가 되감을 수 있는 범위도 2배가 된다. guard가 pair를 2로 세는 이유다. pair가 연속이면 guard는 5까지 커진다. pair가 없는 구간에서는 guard가 작아져 2-prefetch와 2-fetch 기회가 늘어난다.

예측이 빠른 구간에서는 fetch가 조심스러워지고, 예측이 느린 구간에서는 fetch가 과감해진다. 둘이 서로를 당기는 구조다.

### 6.2 페이지 경계는 두 곳에서 막는다

ICache는 페이지를 넘는 블록을 받지 않는다. 일반 블록은 BPU의 페이지 경계 절단 로직이 이를 보장한다. pair second 블록은 그 로직을 지나지 않으므로 uBTB lookup에서 직접 검사한다(4.2). FTQ에는 시뮬레이션용 검사가 있어 second 블록이 페이지를 넘으면 에러를 낸다.

### 6.3 pcMem이 흔들리던 자리에 targetMem을 두다

![그림 6-1](figures/fig14_pcmem_targetmem.png)

**그림 6-1.** pcMem과 targetMem의 write, read 경로.

**pcMem.** 엔트리별 시작 PC다. pair는 한 사이클에 2개를 쓰므로 write port를 하나 더 둔다.

**targetMem.** 엔트리별 예측 target이다. backend의 target 검사에 쓴다.

이전에는 예측 target을 다음 엔트리의 시작 PC, 곧 pcMem[ftqIdx + 1]에서 읽었다. 보통은 맞다. 그런데 다음 엔트리의 enqueue가 override로 취소되거나 FTQ full로 늦어지면 그 자리에 오래된 값이 남는다. 오래된 값이 우연히 틀린 target과 같으면 검사를 통과한다.

targetMem은 자기 엔트리의 enqueue 때 값을 쓰므로 다음 엔트리와 무관하다. predecode redirect는 엔트리를 다시 쓰지 않고 진행 방향만 바꾸므로, 이때 targetMem의 해당 엔트리를 redirect target으로 고쳐 쓴다.

### 6.4 접점에서 찾은 버그 둘

**gcc difftest 레지스터 어긋남.** 레지스터 값이 한 iteration 어긋났다. 원인은 6.3의 오래된 target이었다. targetMem 도입으로 해결했다.

**FPGA gcc hang.** 원인은 2-fetch의 예외 처리였다. 예외를 블록별로 구분하고, WayLookup 예외 표시가 두 엔트리를 모두 덮도록 수정해 해결했다. 5.4의 MainPipe 설명에 있는 두 문장이 이 수정이다.

두 버그의 공통점이 있다. 하나의 요청에 블록이 둘 실리면서 "이 값은 어느 블록의 것인가"가 모호해진 자리에서 생겼다.

### 핵심 정리

1. pair는 guard를 2씩 키운다. 예측이 빨라지는 구간에서 fetch가 조심스러워진다.
2. pair second는 BPU의 보호 로직을 지나지 않으므로 uBTB가 직접 페이지 경계를 검사한다.
3. 다음 엔트리에서 빌려 쓰던 target을 자기 엔트리에 저장하는 것으로 바꿨다. 이것이 targetMem이다.
4. 접점의 버그는 "이 값은 어느 블록 것인가"가 모호해진 자리에서 생겼다.

### 확인 퀴즈

1. pcMem[ftqIdx + 1]이 틀린 값을 가질 수 있는 두 상황은?
2. predecode redirect 때 targetMem을 고쳐 쓰는 이유는? backend redirect 때는 왜 필요 없는가?

<details><summary>답</summary>

1. 다음 엔트리의 enqueue가 S3 override로 취소된 경우와 FTQ full로 늦어진 경우다.
2. predecode redirect는 엔트리를 다시 쓰지 않고 진행 방향만 바꾸므로 enqueue가 다시 일어나지 않는다. backend redirect 뒤에는 BPU가 그 자리부터 다시 예측해 enqueue가 일어나므로 그때 새 값이 쓰인다.

</details>

---

## 7장 · 숫자 읽는 법

이 장의 숫자는 두 종류다. 모델이 낸 기대 범위와 아직 채우지 않은 측정값이다. 둘을 섞지 않는다.

**이 장에서 배우는 것**

* 공급량 증가 비율이 왜 "1 + pair 발화율"로 환원되는지 설명할 수 있다.
* 기대 범위 표의 가정을 열거하고, 어떤 가정이 깨지면 숫자가 어느 쪽으로 움직이는지 말할 수 있다.
* 측정 방법을 perf counter 이름 수준에서 말할 수 있다.

### 7.1 비율은 발화율로 환원된다

변경 전 frontend는 사이클당 fetch block 1개를 공급한다. 변경 후에는 pair가 발화한 사이클에 블록 2개를 공급한다. 따라서 frontend가 막힘 없이 예측을 내는 사이클만 보면

사이클당 명령어 수 비율 = 1 + (pair 발화 사이클 / 전체 예측 사이클)

바이트 상한은 그대로 64바이트다. 늘어나는 것은 "짧은 taken 블록이 연속되는 구간"의 공급량이다. decode 폭이 8이라 이 구간이 바로 backend가 굶는 구간이다.

이론 상한은 2배다. 매 사이클 pair가 발화할 때의 값이다. 실제로는 다음 조건이 발화율을 깎는다.

* 두 블록이 모두 taken으로 끝나야 한다.
* 두 블록의 크기 합이 64바이트 이하여야 한다.
* 첫 분기가 return, indirect가 아니고 둘째 분기가 direct 또는 conditional이어야 한다.
* uBTB에 pair가 올라와 있고 confidence가 문턱을 넘어야 한다.
* S3 override, fetch hungry gate에 걸리지 않아야 한다.

### 실험 7 · 기대 범위 모델

**설명용 모델.** taken 분기 간격 X를 평균 L의 기하 분포로 가정한다. 블록 A와 B의 명령어 수 합이 64바이트 안에 들어갈 확률을 P(X₁ + X₂ ≤ ⌊64 / s⌋)로 계산하고, 여기에 uBTB pair hit률 h, 첫 분기 조건 통과율 85%, 둘째 분기 조건 통과율 85%를 곱한 것을 pair 발화율 q로 둔다. 비율은 1 + q다. ICache miss, ITLB miss, redirect 복구 사이클은 전후 모두 같다고 보고 제외한다. 측정값이 아니다.

| taken 분기 간격 L | 평균 명령어 크기 s | uBTB pair hit 50% | hit 80% | hit 100% | 조건 없는 상한 |
|---|---|---|---|---|---|
| 6 명령어 | 3B (C 확장) | 1.32배 | 1.51배 | 1.64배 | 1.89배 |
| 8 명령어 | 3B | 1.27배 | 1.44배 | 1.55배 | 1.76배 |
| 10 명령어 | 3B | 1.23배 | 1.37배 | 1.46배 | 1.64배 |
| 14 명령어 | 3B | 1.16배 | 1.26배 | 1.32배 | 1.45배 |
| 8 명령어 | 4B (C 미사용) | 1.22배 | 1.35배 | 1.44배 | 1.61배 |
| 10 명령어 | 4B | 1.18배 | 1.28배 | 1.35배 | 1.49배 |

**그림 읽는 법.** 행을 따라 내려가면 간격이 길어질수록 이득이 줄어든다. 긴 블록은 혼자서도 decode 폭을 채우고, 둘을 합치면 64바이트를 넘기 쉽다. 열을 따라 오른쪽으로 가면 uBTB hit률이 이득을 정한다.

**해 볼 것.** 정수 코드의 일반적인 taken 분기 간격 8~10 명령어, uBTB pair hit 50~80%를 넣어 보자. 1.2~1.45배 범위가 나온다. 이제 명령어 크기를 3B에서 4B로 바꿔 보자. 같은 간격에서 이득이 줄어든다. 블록이 바이트 단위로 커져 64바이트 제한에 더 자주 걸리기 때문이다.

### 7.2 어떻게 재는가

측정값은 아직 비어 있다. 채울 때는 다음 방법을 쓴다.

* **사이클당 공급 명령어 수** = IBuffer enqueue 명령어 수 / frontend가 예측을 낸 사이클 수. IBuffer에 `PopCount(enq valid)` 누적 카운터를 추가해 측정한다.
* **발화율** = `pairFireToFtq` / BPU `s1_fire` 사이클 수. 위 비율의 "1 + 발화율"과 일치해야 한다.
* **블록 수 기준 비율** = IFU `ifu_req` / IFU가 fetch를 낸 사이클 수.
* 같은 워크로드를 `EnableTwoTaken = false`, `FetchPorts = 1`로 다시 돌려 분모와 분자를 각각 비교한다.

측정 결과를 적을 때는 다음을 함께 적는다. config, 워크로드, 시뮬레이션 구간, IPC 변화, MPKI 변화, pair 발화율과 pair second 정확도, 2-prefetch와 2-fetch 발동 비율.

### 핵심 정리

1. 공급량 비율은 "1 + pair 발화율"이다. 발화율을 깎는 조건 다섯 가지가 실제 이득을 정한다.
2. 모델의 기대 범위는 1.2~1.45배다. 조건은 간격 8~10 명령어, hit 50~80%, 3바이트 명령어다.
3. 이 장의 숫자는 모델값이다. 측정값은 config와 워크로드와 함께 적어야 비교할 수 있다.

### 확인 퀴즈

1. 발화율이 30%일 때 사이클당 명령어 수 비율은?
2. 같은 taken 분기 간격에서 C 확장을 끄면 이득이 줄어드는 이유는?

<details><summary>답</summary>

1. 1.3배. 막힘 없이 예측을 내는 사이클만 본 값이다.
2. 명령어가 커져 블록의 바이트 수가 늘고, 두 블록의 합이 64바이트를 넘는 경우가 많아진다.

</details>

---

## 8장 · 종합

### 8.1 파라미터

| 이름 | 기본값 | 의미 |
|---|---|---|
| EnableTwoTaken | false | 2-taken 전체 스위치. false면 pair 관련 필드가 생성되지 않는다 |
| uBTB NumEntries | 64 | uBTB 엔트리 수 |
| PairConfWidth | 4 | confidence 비트 수 |
| PairDirectConfThreshold | 2 | BR2가 direct jump일 때 발화 문턱 |
| PairCondConfThreshold | 4 | BR2가 conditional일 때 발화 문턱 |
| PairPrefetchHungryDist | 0 | fetch hungry 조건의 거리. 0이면 꺼짐 |
| FetchPorts | 2 | 2면 2-fetch 사용, 1이면 기존 동작 |

### 8.2 주요 perf counter

| 묶음 | 카운터 |
|---|---|
| 학습 | pairPromote, pairContentKill, pairFastTrainKill, pairSecondMispHit |
| 발화 | pairFire, pairBlockedByConf, pairBlockedByS3Override |
| 정합 | pairSecondTrainSuppressed, abtbTrainDroppedPairSkipMeta, ifuRedirectTargetMemFix |
| 2-fetch | WayLookup의 perf_canNotServeTwoMeta, perf_dataSramReadConflict, perf_hasMmio, perf_hasItlbException |

### 8.3 알려진 한계

* pair second 블록은 S3 예측기를 거치지 않는다. BR2가 틀리면 backend redirect까지 기다려야 한다.
* GHR에 BR2를 넣을 때 블록 B를 분기 1개짜리 블록으로 취급한다. 블록 B 안에서 BR2 앞에 있는 not taken 분기는 반영되지 않는다.
* pair가 발화하는 동안에는 BR2가 S3를 지나지 않아 confidence가 더 오르지 않는다. 문턱은 발화 전 확인 횟수만 조절한다.
* S1 pair 결정 경로(그림 4-3의 빨간 경로)는 타이밍이 빠듯하다. 개선은 `timing/2-taken-s1-pair` 브랜치에서 다룬다.
* fetch hungry 조건은 기본값이 꺼져 있다. 적정 거리는 아직 정하지 않았다.
* 두 번째 블록만 flush되는 경우를 ICache와 IFU에서 직접 처리하는 수정(2에서 1로 즉시 강등)은 `feat/p3_2taken_2fetch`에만 있고 기준 브랜치에는 없다. 기준 브랜치는 guard로 이 경우를 막는다.

### 8.4 파일 맵

| 파일 | 내용 | 장·절 |
|---|---|---|
| `frontend/bpu/ubtb/MicroBtb.scala`, `Bundles.scala` | pair 엔트리, lookup, chain 학습, 무효화 | 4.2, 4.3 |
| `frontend/bpu/Bpu.scala` | emit gate, aBTB 억제와 일치 비교, pair payload, second 엔트리 meta | 4.4, 4.7 |
| `frontend/bpu/Parameters.scala` | pair 파라미터 | 8.1 |
| `frontend/bpu/history/phr/Phr.scala` | PHR 2단 shift, folded history | 4.6 |
| `frontend/bpu/history/commonhr/CommonHR.scala` | GHR, BW, IMLI의 BR2 반영 | 4.6 |
| `frontend/bpu/ras/Ras.scala`, `RasStack.scala` | push 이후 RAS meta | 4.6 |
| `frontend/ftq/Ftq.scala` | 이중 enqueue, isPairSecond, guard, 2-prefetch와 2-fetch 발행, targetMem 구동 | 4.5, 5.2, 6.3 |
| `frontend/TwoFetch.scala` | TwoPrefetchCase | 5.3 |
| `frontend/icache/ICachePrefetchPipe.scala` | 2-prefetch 처리 | 5.3 |
| `frontend/icache/ICacheWayLookup.scala` | 2 write, 2 read, realTwoFetchValid | 5.4 |
| `frontend/icache/ICacheMainPipe.scala` | req(0), req(1) 처리 | 5.4 |
| `frontend/ifu/Ifu.scala`, `InstrCompact.scala` | 두 블록 병합, 블록별 검사 | 5.5 |
| `backend/CtrlBlock.scala` | pcMem 두 번째 write port, targetMem | 6.3 |

### 8.5 책 전체를 다섯 문장으로

1. fetch block의 크기는 프로그램의 분기가 정하므로, frontend는 블록 수를 늘리는 수밖에 없다.
2. 2-taken은 첫 블록의 uBTB 엔트리에 둘째 분기를 적어 두어, 예측기를 한 번만 읽고 분기 둘을 예측한다. 그 대가로 둘째 분기의 종류를 제한하고 틀리면 즉시 버린다.
3. pair 1회는 single 2회와 비트 단위로 같아야 한다. history, RAS, redirect meta가 모두 이 불변식을 향해 설계됐다.
4. 2-fetch는 두 블록을 한 요청에 싣되, 둘째 블록이 S3 override 범위 밖에 있을 때만 그렇게 한다. 그 덕에 캐시와 IFU는 첫 블록만 검사한다.
5. 접점의 버그는 "이 값은 어느 블록 것인가"가 모호해진 자리에서 생겼고, 값을 자기 자리에 두는 것으로 고쳤다.
