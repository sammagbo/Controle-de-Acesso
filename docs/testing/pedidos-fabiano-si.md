# Bloqueadores e pedidos externos (2026-07-10)

## Bloqueadores ativos
B1 [piloto] R1-CDNs: vendorizar libs antes de kiosk offline (ação interna).
B2 [portaria] Payload real DeepinView: precisa backend na VLAN 192.168.1.x (VM/firewall) → PORT-04.
B3 [cantina-prod] 4 terminais não comprados/instalados → CANT-12 e provisioning.
B4 [segurança] R2 confirmar/rotacionar possível senha exposta no histórico git (.mailmap) — decisão do Sam.

## Pedir ao SI
1. VM Ubuntu 24.04 (2vCPU/4GB/40GB), IP FIXO na VLAN 192.168.1.x, firewall: 8080 a partir das duas VLANs + SSH restrito (status do pedido enviado?).
2. **Reserva DHCP** p/ MAC do PC-TRAB (getmac) e do terminal de teste `a4:d5:c2:2f:ea:d2` na 172.20.40.x.
3. Confirmar range/gateway/DNS da VLAN 192.168.1.x p/ IPs fixos dos 4 terminais futuros.
4. (Piloto) Política de energia do PC/VM — sem suspensão.

## Pedir ao Fabiano
1. HCP: confirmar grupo/nível de acesso pronto p/ aplicar aos terminais da cantina quando chegarem (credencial facial ✔ 1194 enviadas).
2. Identificar o controlador de acesso já registrado no HCP (1 porta em anomalia; 34 pessoas pendentes) — o que é, onde está, impacta cantina?
3. Aviso "!" laranja no servidor HCP (licença/serviço?).
4. Cronograma de compra/instalação dos 4 terminais + pontos de rede na cantina.
5. Padrão de cadastro: admins de aparelho SEM face (evita eventos-ruído id=1).
