import { expect } from "chai"
import { resolve, join } from "path"
import * as td from "testdouble"

import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { KubernetesProvider, KubernetesConfig } from "../../../../../../src/plugins/kubernetes/kubernetes"
import { gardenPlugin } from "../../../../../../src/plugins/container/container"
import { dataDir, makeTestGarden, expectError } from "../../../../../helpers"
import { Garden } from "../../../../../../src/garden"
import { moduleFromConfig } from "../../../../../../src/types/module"
import { createIngressResources } from "../../../../../../src/plugins/kubernetes/container/ingress"
import {
  ServicePortProtocol,
  ContainerIngressSpec,
  ContainerService,
  ContainerServiceSpec,
} from "../../../../../../src/plugins/container/config"

const kubeConfigEnvVar = process.env.KUBECONFIG
const namespace = "my-namespace"
const ports = [{
  name: "http",
  protocol: <ServicePortProtocol>"http",
  containerPort: 123,
  servicePort: 123,
}]

const basicConfig: KubernetesConfig = {
  name: "kubernetes",
  context: "my-cluster",
  defaultHostname: "my.domain.com",
  deploymentRegistry: {
    hostname: "foo.garden",
    port: 5000,
    namespace: "boo",
  },
  forceSsl: false,
  imagePullSecrets: [],
  ingressClass: "nginx",
  ingressHttpPort: 80,
  ingressHttpsPort: 443,
  tlsCertificates: [],
}

const basicProvider: KubernetesProvider = {
  name: "kubernetes",
  config: basicConfig,
}

const singleTlsConfig: KubernetesConfig = {
  ...basicConfig,
  forceSsl: true,
  tlsCertificates: [{
    name: "default",
    secretRef: {
      name: "somesecret",
      namespace: "somenamespace",
    },
  }],
}

const singleTlsProvider: KubernetesProvider = {
  name: "kubernetes",
  config: singleTlsConfig,
}

const multiTlsConfig: KubernetesConfig = {
  ...basicConfig,
  forceSsl: true,
  tlsCertificates: [
    {
      name: "default",
      secretRef: {
        name: "somesecret",
        namespace: "somenamespace",
      },
    },
    {
      name: "other",
      secretRef: {
        name: "othersecret",
        namespace: "somenamespace",
      },
    },
    {
      name: "wildcard",
      secretRef: {
        name: "wildcardsecret",
        namespace: "somenamespace",
      },
    },
  ],
}

const multiTlsProvider: KubernetesProvider = {
  name: "kubernetes",
  config: multiTlsConfig,
}

// generated with `openssl req -newkey rsa:2048 -nodes -keyout key.pem -x509 -days 365 -out certificate.pem`
const myDomainCrt = `-----BEGIN CERTIFICATE-----
MIIDgDCCAmgCCQCf3b7n4GtdljANBgkqhkiG9w0BAQsFADCBgTELMAkGA1UEBhMC
REUxDzANBgNVBAgMBkJlcmxpbjEPMA0GA1UEBwwGQmVybGluMRwwGgYDVQQKDBNH
YXJkZW4gR2VybWFueSBHbWJIMRYwFAYDVQQDDA1teS5kb21haW4uY29tMRowGAYJ
KoZIhvcNAQkBFgtmb29AYmFyLmNvbTAeFw0xODA4MjIyMjM2MzlaFw0xOTA4MjIy
MjM2MzlaMIGBMQswCQYDVQQGEwJERTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQH
DAZCZXJsaW4xHDAaBgNVBAoME0dhcmRlbiBHZXJtYW55IEdtYkgxFjAUBgNVBAMM
DW15LmRvbWFpbi5jb20xGjAYBgkqhkiG9w0BCQEWC2Zvb0BiYXIuY29tMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwjtvtg0deKw2EWEmlPqqR3uaa0pF
0ZLCzhKRcU3vK8CWALjfrbmpTpihgoa6KlmLlNB0CicFt8RD6JlVh0WSJQ8sC6bE
pOq+tk3Vn5HKM3U2tdGxdHnYwRbNzT5KNvyTQyXwzilxmySZ/uBmcPFmslCXXEaX
sGxPoHB1CIYWY/dS9Jh6HyasdnlgWnRQLuvCIaASZ4HGmeVtlmZpCZYYQEqHOfOK
kdfUF4QRxpskJwbHSo4nO+zgeXFVztZ2mDbsVxHAAtWL3k9iNiEk5EjfBWxlF+3Z
dC825r7vllRYYqfyXvIAv7nrWKd3YJndU4jRLV5YAgYSpTgorNtZqDXerwIDAQAB
MA0GCSqGSIb3DQEBCwUAA4IBAQBkMkf8wkH4JAv94hz6+JwuyYtj8pe3o71+fo4O
f6VgSbwL0pp0m41A2D9fOcKHNnsswY7uRmbuv69TGlfxeqWM3Ar9Yk3vcmSVrYbX
aQNFiNKyMgaBrWZ33QZuQGxZ4jhNgbBXxEsMc35fIG6PW9dANG0xsVFjY/pNOz5P
bt7cRyaMCoXFe4kPGvNz/6aiaN6mnYQ47zN4nwP0kp0TnXyr6RRwldiPuJn3J7hl
JKbik0ihp5lwyeiRrS7BK2KgBDqmrJ2YB9wShSpJNPFDcpkfEuW/DE2eqUBa//XI
hWtPAGnWC0MD1PsQoC80yix/rCHgDUiSgibfVJSFsjbSFjg5
-----END CERTIFICATE-----`
const myDomainKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCO2+2DR14rDYR
YSaU+qpHe5prSkXRksLOEpFxTe8rwJYAuN+tualOmKGChroqWYuU0HQKJwW3xEPo
mVWHRZIlDywLpsSk6r62TdWfkcozdTa10bF0edjBFs3NPko2/JNDJfDOKXGbJJn+
4GZw8WayUJdcRpewbE+gcHUIhhZj91L0mHofJqx2eWBadFAu68IhoBJngcaZ5W2W
ZmkJlhhASoc584qR19QXhBHGmyQnBsdKjic77OB5cVXO1naYNuxXEcAC1YveT2I2
ISTkSN8FbGUX7dl0Lzbmvu+WVFhip/Je8gC/uetYp3dgmd1TiNEtXlgCBhKlOCis
21moNd6vAgMBAAECggEAM8stqtosdbVWZaQGacu+BHnNX7baj1wXXmRNLG2fzYb5
eQ/TdbwAjdjdmLTch9aBBhngF6T4PVy0zx20VPIUWpWFJUY/QcrnOC3hPT/fL4Ge
KTXVoD2tsy+liYmGuMr5afqAEDm09a348qJcLtnwjLQ46H5ajM0VHq9eRfublOQz
ugp3LFxDt5YY5VwRFVrlu4N40A762HYik3XIyxuOJWbPAtRqLkq5W/rUeN//t64C
yNn+r5oUdwc4bqeK8kClS8Ocf7Skz3yfdteX9y6pMiUWuw3kjABYOcAmwprkYkhz
K9DbxubOPIPeKOCsKe/sKtOci0BziefY+CMgKFnwoQKBgQDr3YErjphk1dHHN7ST
mCn0VLOVq8JkflfInmrqLLTX3gAMghiH0nZOOa1UCSElHVDiWtYOUfxM1Iy+5r0m
feJPE6KBcHBH+Za/meQskAzNv8Jk0rdWJFKeEIxRUYTbg/R/TZbYWajGiUF6juUN
Q8/J0/vbqYA7wPXFKmxw4VGcUwKBgQDS0BnPBXXYPcdoc5hxRiGPmKPEOcmnQesd
8XkeZyh79e950LVCz3sxRl5wk0gQnvv++BY1BA/Og/ekAR6BHsopanH+mLUBRPii
yz6vzoqyKUVSl/9/l76I3kc8bxd08UNlLU4n3/bvcLy6IKaAGZ++W8pTHJ/fh3RT
7G33qulItQKBgQDflBF8Y2frtY9r408F1Wh3lc7BopXbQrQdlKVOI2Cte1/ae3ub
TBIe5qd5kEnd76MbXfWoj2i0v4pG71v/X7alNLyHLDkS0PFn4A2dfFLWud4gSmnF
exrhgFgyQS7KEpQyFC9YF+1XfQYXkdpnr48JByuntk261pdh9WvjuIHuxwKBgAzc
QRbOAHhmnGmU07HlU1rNNwBbfh/D97Hl7zuZk3CseiV2Q/iFa8B/yHcZpQXOjRTq
0X/+dXBlwI+yuceqty57neSoMDKZoIld2L8k3HUt61q0hxOjkC4NUU8wf7/UkAX2
E5R/JzNIL1szbrTV21bjhp43WtFqFACipbq8JGsZAoGAQnUVD19mgqDes7pwjEbS
qQmL6gsT5Aa+U62mal0v7yZxLAp2UxM3o1IO4/GvzMNrnHm6biPVF6rXe6rd3HKX
CD7QP+9C6+Lq3qLjZugk+tAHowIv0stFOw87an3eNXEbfv9Eun3XA2/pDiok4Izg
KFueHimnolQbgsULin79a7M=
-----END PRIVATE KEY-----`

const otherDomainCrt = `-----BEGIN CERTIFICATE-----
MIIDhjCCAm4CCQD1Lw7OkSOCRzANBgkqhkiG9w0BAQsFADCBhDELMAkGA1UEBhMC
REUxDzANBgNVBAgMBkJlcmxpbjEPMA0GA1UEBwwGQmVybGluMRwwGgYDVQQKDBNH
YXJkZW4gR2VybWFueSBHbWJIMRkwFwYDVQQDDBBvdGhlci5kb21haW4uY29tMRow
GAYJKoZIhvcNAQkBFgtmb29AYmFyLmNvbTAeFw0xODA4MjIyMjQ1NDdaFw0xOTA4
MjIyMjQ1NDdaMIGEMQswCQYDVQQGEwJERTEPMA0GA1UECAwGQmVybGluMQ8wDQYD
VQQHDAZCZXJsaW4xHDAaBgNVBAoME0dhcmRlbiBHZXJtYW55IEdtYkgxGTAXBgNV
BAMMEG90aGVyLmRvbWFpbi5jb20xGjAYBgkqhkiG9w0BCQEWC2Zvb0BiYXIuY29t
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4rHiAeGBjwRcK2d89BGq
NLcJYIkeMY36EWveZ2v7349AevYZKQ/toVa/v+aOf2bDb1791+TZDUW9XvN03gWi
EYmpwCUoGZKgDXPDrRb0oI1yYkETqvIt0/E2DG/ha7UzpCbczcu96MNcoQnSjQ6R
+LCiENadtsjzDNssDoWRfNf4wkNekaiIY/+5K3f2G9AywEWWcsOM6jXAbYGteEJM
HgCKsztKFplOvDzUY9vZrob3fvPy8aDevV6eenAZpSk8vbRa+y9/2h0QTXPmncue
Bb8E6MHGW04LLx8xeFueymoic1FDWto5FfCn1xz/b+8ygUWxYDVTxajY6CjtsOTw
1wIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQCzSUldSHTChaBI0pNznt0s4xiiODlU
/b54BlGmZnzQqVsZWbEEDm4szsL6v/5ZNba5dz+zwmp8guL2UKtErxItL6o+zMbT
l18tFltjGKqWzYNLlyw7EgF9qXq74pCMaIN88fxTCdNa/EGY9yvHLeKRiwrCzIXS
O+59NIP21Rk2ZCRPGk/GSPmiYHOc402KXkU3JIqVwFrWdW+R+NX5L6vDZ+4OXDLC
VgjwHFCf0lnebXgKuUjVgt1h0+6GmhsDjJGudRQmLGWqqS41CXwE7sH7az8cqEoG
daFQBcH4PlhS6uPmn+Kxn6jT4V7513q8sR8vDG1TPevv+WNTl+umtr36
-----END CERTIFICATE-----`
const otherDomainKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDiseIB4YGPBFwr
Z3z0Eao0twlgiR4xjfoRa95na/vfj0B69hkpD+2hVr+/5o5/ZsNvXv3X5NkNRb1e
83TeBaIRianAJSgZkqANc8OtFvSgjXJiQROq8i3T8TYMb+FrtTOkJtzNy73ow1yh
CdKNDpH4sKIQ1p22yPMM2ywOhZF81/jCQ16RqIhj/7krd/Yb0DLARZZyw4zqNcBt
ga14QkweAIqzO0oWmU68PNRj29muhvd+8/LxoN69Xp56cBmlKTy9tFr7L3/aHRBN
c+ady54FvwTowcZbTgsvHzF4W57KaiJzUUNa2jkV8KfXHP9v7zKBRbFgNVPFqNjo
KO2w5PDXAgMBAAECggEBAInCc4eVFHhmu+QchZCEU5ypRmeFq/WNQ9Pma0cKFgvr
L9IJT4zmgw+yeeASKbI+LrG1VikmhshMAyJ6bCCn568kqyV67v1rXxwNp3G+K3aN
vl77EQqnFTZgtOml66TafsFYZIIjOAsE/XtXTr4thoNMQ5Bb+4eiYiED56gDf0AP
keGWKEMi4BtZNiFp6JpaSHx7uMvtXbBZ4kkfDT13163nf2y6sBhFiiLRU0FXFVMv
pTkEpb/TwS25FGhoNKPLCmARTeOckkVplXENEy/eF37xKwI2vD/S0UNL7S9j1rdD
zLheC3/uES7AEQLxrJ7PwZ0fDWttQ1c8AYCAUao9ANECgYEA9ZSepY9Md52XOuxH
gb0KUZh3Uvkcqqo/4P6teWCaW1tHUBUITvOdBOUG0o4XpxRTAfOaTI+6J644m/7I
qxmRmzvXAwEoiNf1DfapdsA2u5DFMgJ7oOLNDcN7L3eypxy2aarCtz6H7WEElNd6
AK8I2n2/0gZ/3ds16GMsDaz9PesCgYEA7FAiuX1LI57Q+gG82p/h7P2ppEULXj8+
RfPT5ILKUpvTqkHhSgb81rAYBtTqbUm0rtHTw28LDWPawBKXa2H60DFgMQe6iYO+
s2ZKrFwGM2dvL5Ty9y+Qu0ATv5fgrzPc9rWW5EOMNFro6cano5A2RC8taEnkQ5t9
+mBwhp/bIcUCgYBBPw83ZW8niJMZcJU+/v6y1xM81DqtjTYTjRaB3QyloQa9XBkt
AMSC/GZnoqDeHyQ+rH4eQUFwMXWQ3IxsCQsKd0eU4MXoNZhB8XrstfzUsI3zz30R
LbDVK06bOe4ZQCOmx1ucW9y5UMFq2iTr8ZUkl6xTHK70Pr1/1Hlr2L4fqQKBgQCD
nI36aMG0cPtKgjVAPdOCPjSA/MM8FlUEeKwGlKFCKO9V36Mtq36dwy1egK6fd3Fd
/BbIvcuWBYsLdk9Gyyb5VMaSCA/oDqvjFpF4NThu4KiYA4jeCmu9Hg7hoiDM80GZ
VcFYGBa6Afe+W5l6CxNuHihX8O9kh/E9xQBmuhk9UQKBgQDVrisG1NWkazbN6PTI
6TBB3I1QRgs9+OBX+a48qTjWysi0i221GjQl7ZIrt/FMtxe8CfblyPqrPQQo81hD
dqvKjfuMcRhDFuZo5OT7bvpjMOMIW4s5Nh0N0H3lQj7GzcCMGbfosH7AU5GARTeJ
GTTAp1ONceD+pau5MLsp4HNTiA==
-----END PRIVATE KEY-----`

const wildcardDomainCrt = `-----BEGIN CERTIFICATE-----
MIIDajCCAlICCQDxQgwVCKdC4DANBgkqhkiG9w0BAQsFADB3MQswCQYDVQQIDAJE
RTEPMA0GA1UEBwwGQmVybGluMRwwGgYDVQQKDBNHYXJkZW4gR2VybWFueSBHbWJI
MR0wGwYDVQQDDBQqLndpbGRjYXJkZG9tYWluLmNvbTEaMBgGCSqGSIb3DQEJARYL
Zm9vQGJhci5jb20wHhcNMTgwODI0MTIwMDQxWhcNMTkwODI0MTIwMDQyWjB3MQsw
CQYDVQQIDAJERTEPMA0GA1UEBwwGQmVybGluMRwwGgYDVQQKDBNHYXJkZW4gR2Vy
bWFueSBHbWJIMR0wGwYDVQQDDBQqLndpbGRjYXJkZG9tYWluLmNvbTEaMBgGCSqG
SIb3DQEJARYLZm9vQGJhci5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDc6GpbeJEb4lybm8aOKo8Y2un6t5oJvwSqTllnYhbvAWlcjkolItphIGnL
Y1q+7Kw1OrN5D4aJdnWqgozWFzYtTGRo6rjZmqLvucj9E4OkgP5E/YANciX+fCeR
U1PJLM8dNjRxgsqLKk7Nd8n8DkHCiqY93Rb9vxPvk3gBcm1+Fnl4rvgiZKjjMNsh
W53wzZr0WP3asBCVTYw0D8pUN8m2yK0/ENWBx58OJNIxlEgg00FFD/P+MxQYdVQU
y9MkY8hjR9zLbkxRjVLI4sutw4oJaGhHCTdR+u0wT+nH6MHTrTzxMmjVxkSXm84w
dI1UDfD05R0YofDDoRrvK7LbsEubAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAMRd
LepidcwIz8+hA+vfOK9A1u7BRaBkCWZEcIkb08Yd89byLM/YrlWos7wi6SLs4zbs
mR3ktYFBWRI4hkCWxdwKx0viC+zp2hCBBWeLYO5S4rW7xwQhrO2j/lLo9ymFufk0
Gt4nQXCWQjxJB/6PtXIN0WuYykyi6lW62jv7+kTitqjf2TgLvaIkTbWwX8/xNQdc
Rszcbuu5592lU6RNUyLH9CqRXhwFFZJy99cJFO7QGFHH4t0WUwxVi0R6W3ohPzrN
6uU886TR97KUigTeHI7hUoyf6kXenvoqBITpvbLIxEn1S5aNig1wIfMDF32nU0Ww
fOlTd2SOvQkkPzpQ210=
-----END CERTIFICATE-----`
const wildcardDomainKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDc6GpbeJEb4lyb
m8aOKo8Y2un6t5oJvwSqTllnYhbvAWlcjkolItphIGnLY1q+7Kw1OrN5D4aJdnWq
gozWFzYtTGRo6rjZmqLvucj9E4OkgP5E/YANciX+fCeRU1PJLM8dNjRxgsqLKk7N
d8n8DkHCiqY93Rb9vxPvk3gBcm1+Fnl4rvgiZKjjMNshW53wzZr0WP3asBCVTYw0
D8pUN8m2yK0/ENWBx58OJNIxlEgg00FFD/P+MxQYdVQUy9MkY8hjR9zLbkxRjVLI
4sutw4oJaGhHCTdR+u0wT+nH6MHTrTzxMmjVxkSXm84wdI1UDfD05R0YofDDoRrv
K7LbsEubAgMBAAECggEBAKk/e/UW235UoIUsBST44Ge3mVpYfrEG46kjnAXENjPp
jfK2pYHsQQn3DncgaO8sXwftMIII7he1ZZM8sHB6mix8gdWMOBGoEzu9yIp0///y
QF1VJ12l3gwqzRnfkKrqJMiJtgZdoZab1IJBS8RMm/9TwOhW0n2Yfsqn3mKla9QU
MRk6FHdPjM5mddEJfO1/N655ITbUADuNdASV1aSzcSxylR9uSJmnW6EWZxqqFXKx
e5s65adau5Lpd8rWW4jXigZ8gg1EitAs8JEZW5GqxJ8VHARlFAmAJFXS0XE0XhyB
xI2HLiXQzoELzLDFFtNzSxeMDWNUMfzlsvm/3h0tChECgYEA+pi34leRJvJpbsV8
xK0l50Fg00D+n213pvHMu79XcJV6e6F/c+Jp6DPrSyPeDTguuogS6Hw1ifouhocX
+dZ+YBDmIrut2zbk9p1EczNLHPBqMdAS+l4FNn3ef6VUH6mGXNGX4QzE52kTq4Z/
o66AHYaNL992dtmYl0XUrgvKx5kCgYEA4avRJM4qZoQbyWtBlL2gGWUhvbUHtUNw
uTFDrDa44vPwvFXCPrvh0dTTRCqMQ4/g4CRBdP5/nhXzVlBPmG9sYq16jwv4gRwW
JFTi1ITw5EU2qvJ7fBrdjYL8TRGJjtTzoqoxJsgMCy7/0Y3mnlwW3tJlN/7pXNER
TLUt7PtHXVMCgYEAlrxYF6juocu8yam3FCLGouT7lfcJceKJz3yw1toQgaMYStdo
787oP4lDZi5L+g2qZf9FyFw2ZCl95OPL8zcnSye/FnNn722EqicNLnJTIzQl3JK5
Z6o4Xn+133gWMvlo3dohDnj80+mrsEg17MIhRCFUOdCj1Hesxol1lb94GTkCgYBS
wzORnvaX4E1cgjRr+1tS1O8Z5uFrzc7ybCnYZ71IppQcTgtN/JOl47qTXlNQl9yt
9z32TTu6W2yBtDRswDhsvBidi5NYrldEfckujY7W+LdC3GkDK8sjEe27yfm740dy
2Z3rDiS0mUkCrlrsqvNMRrcOYTNucdI5Ypz0M3eJtwKBgQDsoTp747LhuwcqHOnI
9q7VKLw81T5muQiia74dp3peXIlllUZB24WMOpFJ3VWFMKubWZSTlJVHGomAeZTi
fHt2Oke2uPt2q2zYTs9Taf8RQUhZwTBC9kMby6xvqTVTf+I+NNswmk1OPUsbPEmu
RVZH1thGoL27G6P7od6Zicu4FA==
-----END PRIVATE KEY-----`

const myDomainCertSecret = {
  apiVersion: "v1",
  kind: "Secret",
  metadata: {
    name: "somesecret",
    namespace: "somenamespace",
  },
  data: {
    "tls.crt": Buffer.from(myDomainCrt).toString("base64"),
    "tls.key": Buffer.from(myDomainKey).toString("base64"),
  },
}

const otherDomainCertSecret = {
  apiVersion: "v1",
  kind: "Secret",
  metadata: {
    name: "othersecret",
    namespace: "somenamespace",
  },
  data: {
    "tls.crt": Buffer.from(otherDomainCrt).toString("base64"),
    "tls.key": Buffer.from(otherDomainKey).toString("base64"),
  },
}

const wildcardDomainCertSecret = {
  apiVersion: "v1",
  kind: "Secret",
  metadata: {
    name: "wildcardsecret",
    namespace: "somenamespace",
  },
  data: {
    "tls.crt": Buffer.from(wildcardDomainCrt).toString("base64"),
    "tls.key": Buffer.from(wildcardDomainKey).toString("base64"),
  },
}

describe("createIngressResources", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const handler = gardenPlugin()
  const configure = handler.moduleActions!.container!.configure!

  let garden: Garden

  before(() => {
    process.env.KUBECONFIG = join(__dirname, "config.yml")
  })

  after(() => {
    if (kubeConfigEnvVar) {
      process.env.KUBECONFIG = kubeConfigEnvVar
    } else {
      delete process.env.KUBECONFIG
    }
  })

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { container: gardenPlugin })

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)

    td.replace(Garden.prototype, "resolveVersion", async () => ({
      versionString: "1234",
      dirtyTimestamp: null,
      dependencyVersions: [],
    }))
  })

  async function getTestService(...ingresses: ContainerIngressSpec[]): Promise<ContainerService> {
    const spec: ContainerServiceSpec = {
      name: "my-service",
      annotations: {},
      args: [],
      daemon: false,
      dependencies: [],
      ingresses,
      env: {},
      outputs: {},
      ports,
      volumes: [],
    }
    const moduleConfig = {
      allowPublish: false,
      build: {
        command: [],
        dependencies: [],
      },
      apiVersion: "garden.io/v0",
      name: "test",
      outputs: {},
      path: "/tmp",
      type: "container",

      spec: {
        buildArgs: {},
        image: "some/image:1.1",
        services: [],
        tasks: [],
        tests: [],
      },

      serviceConfigs: [],
      taskConfigs: [],
      testConfigs: [],
    }

    const ctx = await garden.getPluginContext("container")
    const parsed = await configure({ ctx, moduleConfig, log: garden.log })
    const graph = await garden.getConfigGraph()
    const module = await moduleFromConfig(garden, graph, parsed)

    return {
      name: spec.name,
      config: {
        name: spec.name,
        dependencies: [],
        outputs: {},
        spec,
      },
      module,
      sourceModule: module,
      spec,
    }
  }

  function getKubeApi(context: string) {
    const api = new KubeApi(context)

    const core = td.replace(api, "core")
    td.when(core.readNamespacedSecret("somesecret", "somenamespace")).thenResolve({
      body: myDomainCertSecret,
    })
    td.when(core.readNamespacedSecret("othersecret", "somenamespace")).thenResolve({
      body: otherDomainCertSecret,
    })
    td.when(core.readNamespacedSecret("wildcardsecret", "somenamespace")).thenResolve({
      body: wildcardDomainCertSecret,
    })

    td.replace(api, "upsert")

    return api
  }

  it("should create an ingress for a basic container service", async () => {
    const service = await getTestService({
      annotations: {},
      path: "/",
      port: "http",
    })

    const api = getKubeApi(basicProvider.config.context)
    const ingresses = await createIngressResources(api, basicProvider, namespace, service)

    expect(ingresses).to.eql([{
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations: {
          "ingress.kubernetes.io/force-ssl-redirect": "false",
          "kubernetes.io/ingress.class": "nginx",
        },
        namespace,
      },
      spec: {
        rules: [
          {
            host: "my.domain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          },
        ],
      },
    }])
  })

  it("should add annotations if configured", async () => {
    const service = await getTestService({
      annotations: { foo: "bar" },
      path: "/",
      port: "http",
    })

    const api = getKubeApi(basicProvider.config.context)
    const ingresses = await createIngressResources(api, basicProvider, namespace, service)

    expect(ingresses).to.eql([{
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations: {
          "ingress.kubernetes.io/force-ssl-redirect": "false",
          "kubernetes.io/ingress.class": "nginx",
          "foo": "bar",
        },
        namespace,
      },
      spec: {
        rules: [
          {
            host: "my.domain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          },
        ],
      },
    }])
  })

  it("should create multiple ingresses if specified", async () => {
    const service = await getTestService(
      {
        annotations: {},
        path: "/",
        port: "http",
      },
      {
        annotations: {},
        hostname: "bla",
        path: "/foo",
        port: "http",
      },
    )

    const api = getKubeApi(basicProvider.config.context)
    const ingresses = await createIngressResources(api, basicProvider, namespace, service)

    expect(ingresses).to.eql([
      {
        apiVersion: "extensions/v1beta1",
        kind: "Ingress",
        metadata: {
          name: service.name,
          annotations: {
            "ingress.kubernetes.io/force-ssl-redirect": "false",
            "kubernetes.io/ingress.class": "nginx",
          },
          namespace,
        },
        spec: {
          rules: [{
            host: "my.domain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          }],
        },
      },
      {
        apiVersion: "extensions/v1beta1",
        kind: "Ingress",
        metadata: {
          name: service.name,
          annotations: {
            "ingress.kubernetes.io/force-ssl-redirect": "false",
            "kubernetes.io/ingress.class": "nginx",
          },
          namespace,
        },
        spec: {
          rules: [{
            host: "bla",
            http: {
              paths: [
                {
                  path: "/foo",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          }],
        },
      },
    ])
  })

  it("should map a configured TLS certificate to an ingress", async () => {
    const service = await getTestService(
      {
        annotations: {},
        path: "/",
        port: "http",
      },
    )

    const api = getKubeApi(singleTlsProvider.config.context)
    const ingresses = await createIngressResources(api, singleTlsProvider, namespace, service)

    td.verify(api.upsert("Secret", namespace, myDomainCertSecret))

    expect(ingresses).to.eql([{
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations: {
          "ingress.kubernetes.io/force-ssl-redirect": "true",
          "kubernetes.io/ingress.class": "nginx",
        },
        namespace,
      },
      spec: {
        tls: [{
          secretName: "somesecret",
        }],
        rules: [
          {
            host: "my.domain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          },
        ],
      },
    }])
  })

  it("should throw if a configured certificate doesn't exist", async () => {
    const service = await getTestService(
      {
        annotations: {},
        path: "/",
        port: "http",
      },
    )

    const api = getKubeApi(basicConfig.context)

    const provider = {
      name: "kubernetes",
      config: {
        ...basicConfig,
        tlsCertificates: [{
          name: "foo",
          secretRef: { name: "foo", namespace: "default" },
        }],
      },
    }

    const err: any = new Error("nope")
    err.code = 404
    td.when(api.core.readNamespacedSecret("foo", "default")).thenReject(err)

    await expectError(async () => await createIngressResources(api, provider, namespace, service), "configuration")
  })

  it("should throw if a secret for a configured certificate doesn't contain a certificate", async () => {
    const service = await getTestService(
      {
        annotations: {},
        path: "/",
        port: "http",
      },
    )

    const provider = {
      name: "kubernetes",
      config: {
        ...basicConfig,
        tlsCertificates: [{
          name: "foo",
          secretRef: { name: "foo", namespace: "default" },
        }],
      },
    }

    const api = getKubeApi(basicConfig.context)

    const err: any = new Error("nope")
    err.code = 404
    td.when(api.core.readNamespacedSecret("foo", "default")).thenResolve({
      body: {
        data: {},
      },
    })

    await expectError(async () => await createIngressResources(api, provider, namespace, service), "configuration")
  })

  it("should throw if a secret for a configured certificate contains an invalid certificate", async () => {
    const service = await getTestService(
      {
        annotations: {},
        path: "/",
        port: "http",
      },
    )

    const provider = {
      name: "kubernetes",
      config: {
        ...basicConfig,
        tlsCertificates: [{
          name: "foo",
          secretRef: { name: "foo", namespace: "default" },
        }],
      },
    }

    const api = getKubeApi(basicConfig.context)

    const err: any = new Error("nope")
    err.code = 404
    td.when(api.core.readNamespacedSecret("foo", "default")).thenResolve({
      body: {
        data: {
          "tls.crt": "blablablablablalbalblabl",
        },
      },
    })

    await expectError(async () => await createIngressResources(api, provider, namespace, service), "configuration")
  })

  it("should correctly match an ingress to a wildcard certificate", async () => {
    const service = await getTestService(
      {
        annotations: {},
        hostname: "something.wildcarddomain.com",
        path: "/",
        port: "http",
      },
    )

    const api = getKubeApi(multiTlsProvider.config.context)
    const ingresses = await createIngressResources(api, multiTlsProvider, namespace, service)

    td.verify(api.upsert("Secret", namespace, wildcardDomainCertSecret))

    expect(ingresses).to.eql([{
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations: {
          "ingress.kubernetes.io/force-ssl-redirect": "true",
          "kubernetes.io/ingress.class": "nginx",
        },
        namespace,
      },
      spec: {
        tls: [{
          secretName: "wildcardsecret",
        }],
        rules: [
          {
            host: "something.wildcarddomain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          },
        ],
      },
    }])
  })

  it("should use configured hostnames for a certificate when specified", async () => {
    const service = await getTestService(
      {
        annotations: {},
        hostname: "madeup.domain.com",
        path: "/",
        port: "http",
      },
    )

    const api = getKubeApi(basicConfig.context)

    const provider = {
      name: "kubernetes",
      config: {
        ...basicConfig,
        tlsCertificates: [{
          name: "madeup",
          hostnames: ["madeup.domain.com"],
          secretRef: { name: "somesecret", namespace: "somenamespace" },
        }],
      },
    }

    td.when(api.core.readNamespacedSecret("foo", "default")).thenResolve({
      body: myDomainCertSecret,
    })
    const ingresses = await createIngressResources(api, provider, namespace, service)

    td.verify(api.upsert("Secret", namespace, myDomainCertSecret))

    expect(ingresses).to.eql([{
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations: {
          "ingress.kubernetes.io/force-ssl-redirect": "true",
          "kubernetes.io/ingress.class": "nginx",
        },
        namespace,
      },
      spec: {
        tls: [{
          secretName: "somesecret",
        }],
        rules: [
          {
            host: "madeup.domain.com",
            http: {
              paths: [
                {
                  path: "/",
                  backend: {
                    serviceName: "my-service",
                    servicePort: 123,
                  },
                },
              ],
            },
          },
        ],
      },
    }])
  })
})