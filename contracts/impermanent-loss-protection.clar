;; Impermanent Loss Protection Contract
;; Mitigates liquidity provider risks through insurance mechanisms

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u500))
(define-constant ERR_NOT_ELIGIBLE (err u501))
(define-constant ERR_INSUFFICIENT_COVERAGE (err u502))
(define-constant ERR_CLAIM_TOO_EARLY (err u503))
(define-constant ERR_ALREADY_CLAIMED (err u504))

;; Protection parameters
(define-constant MIN_LIQUIDITY_PERIOD u144) ;; ~24 hours in blocks
(define-constant MAX_PROTECTION_RATE u5000) ;; 50% max protection
(define-constant PROTECTION_FUND_RATE u100) ;; 1% of fees go to protection fund

;; Data structures
(define-map protection-positions
  {pair: {token-a: principal, token-b: principal}, provider: principal}
  {
    initial-price-ratio: uint,
    liquidity-amount: uint,
    entry-block: uint,
    protection-rate: uint,
    claimed: bool
  })

(define-map protection-fund
  {token-a: principal, token-b: principal}
  uint) ;; Available protection funds

(define-map il-claims
  {pair: {token-a: principal, token-b: principal}, provider: principal}
  {amount: uint, claim-block: uint})

;; Register for impermanent loss protection
(define-public (register-protection
  (token-a principal)
  (token-b principal)
  (initial-price-ratio uint)
  (liquidity-amount uint)
  (protection-rate uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (provider tx-sender)
  )
    (asserts! (<= protection-rate MAX_PROTECTION_RATE) ERR_NOT_ELIGIBLE)

    (map-set protection-positions {pair: pair, provider: provider} {
      initial-price-ratio: initial-price-ratio,
      liquidity-amount: liquidity-amount,
      entry-block: block-height,
      protection-rate: protection-rate,
      claimed: false
    })

    (ok true)))

;; Calculate impermanent loss
(define-read-only (calculate-impermanent-loss
  (initial-price-ratio uint)
  (current-price-ratio uint)
  (liquidity-amount uint))
  (let (
    (price-change-ratio (if (> current-price-ratio initial-price-ratio)
                          (/ current-price-ratio initial-price-ratio)
                          (/ initial-price-ratio current-price-ratio)))
    ;; Simplified IL calculation: IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
    (sqrt-ratio (sqrt-approximation price-change-ratio))
    (il-factor (if (> price-change-ratio u1000000)
                 (- (/ (* u2 sqrt-ratio) (+ u1000000 price-change-ratio)) u1000000)
                 u0))
  )
    (/ (* liquidity-amount il-factor) u1000000)))

;; Check eligibility for protection claim
(define-read-only (check-claim-eligibility
  (token-a principal)
  (token-b principal)
  (provider principal)
  (current-price-ratio uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (position (map-get? protection-positions {pair: pair, provider: provider}))
  )
    (match position
      pos (let (
        (blocks-elapsed (- block-height (get entry-block pos)))
        (il-amount (calculate-impermanent-loss
                     (get initial-price-ratio pos)
                     current-price-ratio
                     (get liquidity-amount pos)))
        (protection-amount (/ (* il-amount (get protection-rate pos)) u10000))
      )
        {
          eligible: (and
            (>= blocks-elapsed MIN_LIQUIDITY_PERIOD)
            (not (get claimed pos))
            (> il-amount u0)),
          il-amount: il-amount,
          protection-amount: protection-amount,
          blocks-elapsed: blocks-elapsed
        })
      {eligible: false, il-amount: u0, protection-amount: u0, blocks-elapsed: u0})))

;; Claim impermanent loss protection
(define-public (claim-protection
  (token-a principal)
  (token-b principal)
  (current-price-ratio uint))
  (let (
    (pair {token-a: token-a, token-b: token-b})
    (provider tx-sender)
    (eligibility (check-claim-eligibility token-a token-b provider current-price-ratio))
    (position (unwrap! (map-get? protection-positions {pair: pair, provider: provider}) ERR_NOT_ELIGIBLE))
    (available-fund (default-to u0 (map-get? protection-fund pair)))
  )
    (asserts! (get eligible eligibility) ERR_NOT_ELIGIBLE)
    (asserts! (not (get claimed position)) ERR_ALREADY_CLAIMED)
    (asserts! (>= available-fund (get protection-amount eligibility)) ERR_INSUFFICIENT_COVERAGE)

    ;; Update position as claimed
    (map-set protection-positions {pair: pair, provider: provider}
             (merge position {claimed: true}))

    ;; Deduct from protection fund
    (map-set protection-fund pair (- available-fund (get protection-amount eligibility)))

    ;; Record claim
    (map-set il-claims {pair: pair, provider: provider} {
      amount: (get protection-amount eligibility),
      claim-block: block-height
    })

    (ok (get protection-amount eligibility))))

;; Add funds to protection pool
(define-public (add-protection-funds
  (token-a principal)
  (token-b principal)
  (amount uint))
  (let ((pair {token-a: token-a, token-b: token-b}))
    (map-set protection-fund pair
             (+ (default-to u0 (map-get? protection-fund pair)) amount))
    (ok true)))

;; Get protection fund balance
(define-read-only (get-protection-fund-balance (token-a principal) (token-b principal))
  (default-to u0 (map-get? protection-fund {token-a: token-a, token-b: token-b})))

;; Get protection position
(define-read-only (get-protection-position (token-a principal) (token-b principal) (provider principal))
  (map-get? protection-positions {pair: {token-a: token-a, token-b: token-b}, provider: provider}))

;; Helper function for square root approximation
(define-private (sqrt-approximation (n uint))
  (if (<= n u1000000) u1000
    (let ((x (/ n u2000)))
      (/ (+ x (/ n x)) u2))))
