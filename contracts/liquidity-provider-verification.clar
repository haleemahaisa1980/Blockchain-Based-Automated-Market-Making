;; Liquidity Provider Verification Contract
;; Validates and manages liquidity pool contributors

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_ALREADY_VERIFIED (err u101))
(define-constant ERR_NOT_VERIFIED (err u102))
(define-constant ERR_INSUFFICIENT_STAKE (err u103))

;; Minimum stake required for verification (in microSTX)
(define-constant MIN_STAKE u1000000)

;; Data structures
(define-map verified-providers principal bool)
(define-map provider-stakes principal uint)
(define-map provider-reputation principal uint)

;; Verify a liquidity provider
(define-public (verify-provider (stake uint))
  (let ((provider tx-sender))
    (asserts! (>= stake MIN_STAKE) ERR_INSUFFICIENT_STAKE)
    (asserts! (is-none (map-get? verified-providers provider)) ERR_ALREADY_VERIFIED)

    ;; Store verification status and stake
    (map-set verified-providers provider true)
    (map-set provider-stakes provider stake)
    (map-set provider-reputation provider u100) ;; Starting reputation score

    (ok true)))

;; Check if provider is verified
(define-read-only (is-verified (provider principal))
  (default-to false (map-get? verified-providers provider)))

;; Get provider stake
(define-read-only (get-provider-stake (provider principal))
  (map-get? provider-stakes provider))

;; Get provider reputation
(define-read-only (get-provider-reputation (provider principal))
  (default-to u0 (map-get? provider-reputation provider)))

;; Update provider reputation (only contract owner)
(define-public (update-reputation (provider principal) (new-reputation uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (is-verified provider) ERR_NOT_VERIFIED)
    (map-set provider-reputation provider new-reputation)
    (ok true)))

;; Remove verification (only contract owner)
(define-public (remove-verification (provider principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-delete verified-providers provider)
    (map-delete provider-stakes provider)
    (map-delete provider-reputation provider)
    (ok true)))
