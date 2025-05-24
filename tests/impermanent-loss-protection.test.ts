import { describe, it, expect, beforeEach } from "vitest"

describe("Impermanent Loss Protection Contract", () => {
  let contract
  let tokenA
  let tokenB
  let provider1
  let provider2
  let owner
  
  beforeEach(() => {
    contract = {
      protectionPositions: new Map(),
      protectionFund: new Map(),
      ilClaims: new Map(),
      blockHeight: 1000,
      MIN_LIQUIDITY_PERIOD: 144,
      MAX_PROTECTION_RATE: 5000,
      CONTRACT_OWNER: "SP1234567890OWNER",
    }
    
    tokenA = "SP1111111111TOKEN-A"
    tokenB = "SP2222222222TOKEN-B"
    provider1 = "SP1111111111PROVIDER1"
    provider2 = "SP2222222222PROVIDER2"
    owner = "SP1234567890OWNER"
  })
  
  describe("register-protection", () => {
    it("should register protection successfully", () => {
      const result = registerProtection(
          contract,
          provider1,
          tokenA,
          tokenB,
          1000000,
          10000,
          3000, // price ratio, liquidity, 30% protection
      )
      
      expect(result.success).toBe(true)
      
      const positionKey = JSON.stringify({ pair: { tokenA, tokenB }, provider: provider1 })
      const position = contract.protectionPositions.get(positionKey)
      expect(position.initialPriceRatio).toBe(1000000)
      expect(position.liquidityAmount).toBe(10000)
      expect(position.protectionRate).toBe(3000)
      expect(position.entryBlock).toBe(contract.blockHeight)
      expect(position.claimed).toBe(false)
    })
    
    it("should reject excessive protection rate", () => {
      const result = registerProtection(
          contract,
          provider1,
          tokenA,
          tokenB,
          1000000,
          10000,
          6000, // 60% protection - exceeds max
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_NOT_ELIGIBLE")
    })
  })
  
  describe("calculate-impermanent-loss", () => {
    
    it("should return zero IL for no price change", () => {
      const initialPrice = 1000000
      const currentPrice = 1000000
      const liquidityAmount = 10000
      
      const result = calculateImpermanentLoss(initialPrice, currentPrice, liquidityAmount)
      
      expect(result).toBe(0)
    })
  })
  
  describe("check-claim-eligibility", () => {
    beforeEach(() => {
      registerProtection(contract, provider1, tokenA, tokenB, 1000000, 10000, 3000)
    })
    
    it("should not be eligible before minimum period", () => {
      contract.blockHeight = 1100 // Only 100 blocks later
      
      const currentPrice = 2000000
      const result = checkClaimEligibility(contract, tokenA, tokenB, provider1, currentPrice)
      
      expect(result.eligible).toBe(false)
      expect(result.blocksElapsed).toBe(100)
    })
    
    it("should not be eligible with no IL", () => {
      contract.blockHeight = 1200
      
      const currentPrice = 1000000 // Same price
      const result = checkClaimEligibility(contract, tokenA, tokenB, provider1, currentPrice)
      
      expect(result.eligible).toBe(false)
      expect(result.ilAmount).toBe(0)
    })
    
    it("should not be eligible if already claimed", () => {
      contract.blockHeight = 1200
      
      // Mark as already claimed
      const positionKey = JSON.stringify({ pair: { tokenA, tokenB }, provider: provider1 })
      const position = contract.protectionPositions.get(positionKey)
      contract.protectionPositions.set(positionKey, { ...position, claimed: true })
      
      const currentPrice = 2000000
      const result = checkClaimEligibility(contract, tokenA, tokenB, provider1, currentPrice)
      
      expect(result.eligible).toBe(false)
    })
  })
  
  describe("claim-protection", () => {
    beforeEach(() => {
      registerProtection(contract, provider1, tokenA, tokenB, 1000000, 10000, 3000)
      contract.blockHeight = 1200 // Advance time
      
      // Add funds to protection pool
      addProtectionFunds(contract, tokenA, tokenB, 50000)
    })
  
    it("should reject claim when not eligible", () => {
      contract.blockHeight = 1100 // Not enough time passed
      
      const currentPrice = 2000000
      const result = claimProtection(contract, provider1, tokenA, tokenB, currentPrice)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_NOT_ELIGIBLE")
    })
  })
  
  describe("add-protection-funds", () => {
    it("should add funds to protection pool", () => {
      const result = addProtectionFunds(contract, tokenA, tokenB, 10000)
      
      expect(result.success).toBe(true)
      
      const pairKey = JSON.stringify({ tokenA, tokenB })
      expect(contract.protectionFund.get(pairKey)).toBe(10000)
    })
    
    it("should accumulate multiple fund additions", () => {
      addProtectionFunds(contract, tokenA, tokenB, 10000)
      const result = addProtectionFunds(contract, tokenA, tokenB, 5000)
      
      expect(result.success).toBe(true)
      
      const pairKey = JSON.stringify({ tokenA, tokenB })
      expect(contract.protectionFund.get(pairKey)).toBe(15000)
    })
  })
  
  describe("get-protection-fund-balance", () => {
    it("should return correct balance", () => {
      addProtectionFunds(contract, tokenA, tokenB, 25000)
      
      const balance = getProtectionFundBalance(contract, tokenA, tokenB)
      
      expect(balance).toBe(25000)
    })
    
    it("should return zero for non-existent fund", () => {
      const balance = getProtectionFundBalance(contract, "TOKEN-X", "TOKEN-Y")
      
      expect(balance).toBe(0)
    })
  })
})

// Mock contract functions
function registerProtection(contract, provider, tokenA, tokenB, initialPriceRatio, liquidityAmount, protectionRate) {
  if (protectionRate > contract.MAX_PROTECTION_RATE) {
    return { success: false, error: "ERR_NOT_ELIGIBLE" }
  }
  
  const positionKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  contract.protectionPositions.set(positionKey, {
    initialPriceRatio,
    liquidityAmount,
    entryBlock: contract.blockHeight,
    protectionRate,
    claimed: false,
  })
  
  return { success: true }
}

function calculateImpermanentLoss(initialPriceRatio, currentPriceRatio, liquidityAmount) {
  const priceChangeRatio =
      currentPriceRatio > initialPriceRatio
          ? Math.floor((currentPriceRatio * 1000000) / initialPriceRatio)
          : Math.floor((initialPriceRatio * 1000000) / currentPriceRatio)
  
  if (priceChangeRatio <= 1000000) {
    return 0
  }
  
  // Simplified IL calculation
  const sqrtRatio = sqrtApproximation(priceChangeRatio)
  const ilFactor = Math.floor((2 * sqrtRatio) / (1000000 + priceChangeRatio)) - 1000000
  
  if (ilFactor <= 0) return 0
  
  return Math.floor((liquidityAmount * ilFactor) / 1000000)
}

function checkClaimEligibility(contract, tokenA, tokenB, provider, currentPriceRatio) {
  const positionKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  const position = contract.protectionPositions.get(positionKey)
  
  if (!position) {
    return { eligible: false, ilAmount: 0, protectionAmount: 0, blocksElapsed: 0 }
  }
  
  const blocksElapsed = contract.blockHeight - position.entryBlock
  const ilAmount = calculateImpermanentLoss(position.initialPriceRatio, currentPriceRatio, position.liquidityAmount)
  const protectionAmount = Math.floor((ilAmount * position.protectionRate) / 10000)
  
  const eligible = blocksElapsed >= contract.MIN_LIQUIDITY_PERIOD && !position.claimed && ilAmount > 0
  
  return { eligible, ilAmount, protectionAmount, blocksElapsed }
}

function claimProtection(contract, provider, tokenA, tokenB, currentPriceRatio) {
  const eligibility = checkClaimEligibility(contract, tokenA, tokenB, provider, currentPriceRatio)
  const positionKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  const position = contract.protectionPositions.get(positionKey)
  
  if (!eligibility.eligible) {
    return { success: false, error: "ERR_NOT_ELIGIBLE" }
  }
  
  if (!position || position.claimed) {
    return { success: false, error: "ERR_ALREADY_CLAIMED" }
  }
  
  const pairKey = JSON.stringify({ tokenA, tokenB })
  const availableFund = contract.protectionFund.get(pairKey) || 0
  
  if (availableFund < eligibility.protectionAmount) {
    return { success: false, error: "ERR_INSUFFICIENT_COVERAGE" }
  }
  
  // Mark position as claimed
  contract.protectionPositions.set(positionKey, { ...position, claimed: true })
  
  // Deduct from protection fund
  contract.protectionFund.set(pairKey, availableFund - eligibility.protectionAmount)
  
  // Record claim
  const claimKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  contract.ilClaims.set(claimKey, {
    amount: eligibility.protectionAmount,
    claimBlock: contract.blockHeight,
  })
  
  return { success: true, amount: eligibility.protectionAmount }
}

function addProtectionFunds(contract, tokenA, tokenB, amount) {
  const pairKey = JSON.stringify({ tokenA, tokenB })
  const currentFund = contract.protectionFund.get(pairKey) || 0
  contract.protectionFund.set(pairKey, currentFund + amount)
  
  return { success: true }
}

function getProtectionFundBalance(contract, tokenA, tokenB) {
  const pairKey = JSON.stringify({ tokenA, tokenB })
  return contract.protectionFund.get(pairKey) || 0
}

function sqrtApproximation(n) {
  if (n <= 1000000) return 1000
  
  let x = Math.floor(n / 2000)
  x = Math.floor((x + Math.floor(n / x)) / 2)
  return x
}
