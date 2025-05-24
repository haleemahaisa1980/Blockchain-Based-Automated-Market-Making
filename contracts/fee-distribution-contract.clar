;; Fee Distribution Contract
;; Allocates trading fees to liquidity providers and protocol

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_NO_FEES (err u401))
(define-constant ERR_INVALID_ALLOCATION (err u402))

;; Fee allocation percentages (basis points, 10000 = 100%)
(define-constant LIQUIDITY_PROVIDER_SHARE u8000) ;; 80%
(define-constant PROTOCOL_SHARE u2000) ;; 20%

;; Data structures
(define-map accumulated-fees
  {token-a: principal, token-b: principal}
  {fee-a: uint, fee-b: uint, last-update: uint})

(define-map provider-fee-claims
  {pair: {token-a: principal, token-b: principal}, provider: principal}
  {claimed-a: uint, claimed-b: uint, last-claim: uint})

(define-map protocol-fees
  principal ;; token
  uint) ;; accumulated amount

;; Accumulate fees from trading
(define-public (accumulate-fees
  (token-a principal)
  (token-b principal)
  (fee-a uint)
  (fee-b uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (current-fees (default-to {fee-a: u0, fee-b: u0, last-update: u0}
                              (map-get? accumulated-fees pair)))
  )
    (map-set accumulated-fees pair {
      fee-a: (+ (get fee-a current-fees) fee-a),
      fee-b: (+ (get fee-b current-fees) fee-b),
      last-update: block-height
    })
    (ok true)))

;; Calculate claimable fees for a liquidity provider
(define-read-only (get-claimable-fees
  (token-a principal)
  (token-b principal)
  (provider principal)
  (provider-shares uint)
  (total-shares uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (accumulated (default-to {fee-a: u0, fee-b: u0, last-update: u0}
                             (map-get? accumulated-fees pair)))
    (claimed (default-to {claimed-a: u0, claimed-b: u0, last-claim: u0}
                        (map-get? provider-fee-claims {pair: pair, provider: provider})))
  )
    (if (is-eq total-shares u0)
      {claimable-a: u0, claimable-b: u0}
      (let (
        (provider-portion (/ (* provider-shares u10000) total-shares))
        (lp-fee-a (/ (* (get fee-a accumulated) LIQUIDITY_PROVIDER_SHARE) u10000))
        (lp-fee-b (/ (* (get fee-b accumulated) LIQUIDITY_PROVIDER_SHARE) u10000))
        (provider-fee-a (/ (* lp-fee-a provider-portion) u10000))
        (provider-fee-b (/ (* lp-fee-b provider-portion) u10000))
      )
        {
          claimable-a: (- provider-fee-a (get claimed-a claimed)),
          claimable-b: (- provider-fee-b (get claimed-b claimed))
        }))))

;; Claim fees for liquidity provider
(define-public (claim-fees
  (token-a principal)
  (token-b principal)
  (provider-shares uint)
  (total-shares uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (provider tx-sender)
    (claimable (get-claimable-fees token-a token-b provider provider-shares total-shares))
    (current-claimed (default-to {claimed-a: u0, claimed-b: u0, last-claim: u0}
                                (map-get? provider-fee-claims {pair: pair, provider: provider})))
  )
    (asserts! (or (> (get claimable-a claimable) u0) (> (get claimable-b claimable) u0)) ERR_NO_FEES)

    ;; Update claimed amounts
    (map-set provider-fee-claims {pair: pair, provider: provider} {
      claimed-a: (+ (get claimed-a current-claimed) (get claimable-a claimable)),
      claimed-b: (+ (get claimed-b current-claimed) (get claimable-b claimable)),
      last-claim: block-height
    })

    (ok claimable)))

;; Distribute protocol fees
(define-public (distribute-protocol-fees
  (token-a principal)
  (token-b principal))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (accumulated (unwrap! (map-get? accumulated-fees pair) ERR_NO_FEES))
    (protocol-fee-a (/ (* (get fee-a accumulated) PROTOCOL_SHARE) u10000))
    (protocol-fee-b (/ (* (get fee-b accumulated) PROTOCOL_SHARE) u10000))
  )
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)

    ;; Update protocol fee accumulation
    (map-set protocol-fees token-a
             (+ (default-to u0 (map-get? protocol-fees token-a)) protocol-fee-a))
    (map-set protocol-fees token-b
             (+ (default-to u0 (map-get? protocol-fees token-b)) protocol-fee-b))

    (ok {protocol-fee-a: protocol-fee-a, protocol-fee-b: protocol-fee-b})))

;; Get accumulated fees for a pair
(define-read-only (get-accumulated-fees (token-a principal) (token-b principal))
  (map-get? accumulated-fees {token-a: token-a, token-b: token-b}))

;; Get protocol fees for a token
(define-read-only (get-protocol-fees (token principal))
  (default-to u0 (map-get? protocol-fees token)))

;; Withdraw protocol fees (only owner)
(define-public (withdraw-protocol-fees (token principal) (amount uint))
  (let ((available (default-to u0 (map-get? protocol-fees token))))
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (<= amount available) ERR_NO_FEES)

    (map-set protocol-fees token (- available amount))
    (ok amount)))
