;; Price Discovery Contract
;; Calculates exchange rates using constant product formula

(define-constant ERR_INVALID_PAIR (err u300))
(define-constant ERR_INSUFFICIENT_LIQUIDITY (err u301))
(define-constant ERR_SLIPPAGE_TOO_HIGH (err u302))
(define-constant ERR_ZERO_AMOUNT (err u303))

;; Calculate output amount for a given input (constant product formula: x * y = k)
(define-read-only (get-amount-out
  (amount-in uint)
  (reserve-in uint)
  (reserve-out uint)
  (fee-rate uint))
  (begin
    (asserts! (> amount-in u0) ERR_ZERO_AMOUNT)
    (asserts! (and (> reserve-in u0) (> reserve-out u0)) ERR_INSUFFICIENT_LIQUIDITY)

    (let (
      (amount-in-with-fee (- amount-in (/ (* amount-in fee-rate) u10000)))
      (numerator (* amount-in-with-fee reserve-out))
      (denominator (+ reserve-in amount-in-with-fee))
    )
      (ok (/ numerator denominator)))))

;; Calculate input amount for a given output
(define-read-only (get-amount-in
  (amount-out uint)
  (reserve-in uint)
  (reserve-out uint)
  (fee-rate uint))
  (begin
    (asserts! (> amount-out u0) ERR_ZERO_AMOUNT)
    (asserts! (and (> reserve-in u0) (> reserve-out amount-out)) ERR_INSUFFICIENT_LIQUIDITY)

    (let (
      (numerator (* reserve-in amount-out))
      (denominator (- reserve-out amount-out))
      (amount-in-before-fee (/ numerator denominator))
      (fee-multiplier (+ u10000 fee-rate))
    )
      (ok (/ (* amount-in-before-fee fee-multiplier) u10000)))))

;; Get current price ratio
(define-read-only (get-price-ratio (reserve-a uint) (reserve-b uint))
  (begin
    (asserts! (and (> reserve-a u0) (> reserve-b u0)) ERR_INSUFFICIENT_LIQUIDITY)
    (ok (/ (* reserve-b u1000000) reserve-a))))

;; Calculate price impact for a trade
(define-read-only (get-price-impact
  (amount-in uint)
  (reserve-in uint)
  (reserve-out uint))
  (begin
    (asserts! (and (> reserve-in u0) (> reserve-out u0)) ERR_INSUFFICIENT_LIQUIDITY)

    (let (
      (price-before (/ (* reserve-out u1000000) reserve-in))
      (new-reserve-in (+ reserve-in amount-in))
      (new-reserve-out (/ (* reserve-in reserve-out) new-reserve-in))
      (price-after (/ (* new-reserve-out u1000000) new-reserve-in))
      (impact (if (> price-before price-after)
                 (/ (* (- price-before price-after) u10000) price-before)
                 u0))
    )
      (ok impact))))

;; Validate slippage tolerance
(define-read-only (check-slippage
  (expected-amount uint)
  (actual-amount uint)
  (slippage-tolerance uint))
  (let (
    (min-amount (- expected-amount (/ (* expected-amount slippage-tolerance) u10000)))
  )
    (>= actual-amount min-amount)))

;; Get optimal trade route (simplified for two-hop trades)
(define-read-only (get-optimal-route
  (amount-in uint)
  (token-a principal)
  (token-b principal)
  (token-c principal)
  (reserve-ab-a uint) (reserve-ab-b uint)
  (reserve-bc-b uint) (reserve-bc-c uint)
  (fee-rate uint))
  (let (
    ;; Direct route: A -> C (if pair exists)
    (direct-out (get-amount-out amount-in reserve-ab-a reserve-bc-c fee-rate))

    ;; Two-hop route: A -> B -> C
    (intermediate-out (unwrap-panic (get-amount-out amount-in reserve-ab-a reserve-ab-b fee-rate)))
    (final-out (get-amount-out intermediate-out reserve-bc-b reserve-bc-c fee-rate))
  )
    ;; Return the route with better output
    (if (is-ok direct-out)
      (if (> (unwrap-panic direct-out) (unwrap-panic final-out))
        (ok {route: "direct", amount-out: (unwrap-panic direct-out)})
        (ok {route: "two-hop", amount-out: (unwrap-panic final-out)}))
      (ok {route: "two-hop", amount-out: (unwrap-panic final-out)}))))
