import { describe, it, expect, beforeEach } from "vitest"

describe("Fee Distribution Contract", () => {
  let contract
  let tokenA
  let tokenB
  let provider1
  let provider2
  let owner
  
  beforeEach(() => {
    contract = {
      accumulatedFees: new Map(),
      providerFeeClaims: new Map(),
      protocolFees: new Map(),
      blockHeight: 1000,
      LIQUIDITY_PROVIDER_SHARE: 8000, // 80%
      PROTOCOL_SHARE: 2000, // 20%
      CONTRACT_OWNER: "SP1234567890OWNER",
    }
    
    tokenA = "SP1111111111TOKEN-A"
    tokenB = "SP2222222222TOKEN-B"
    provider1 = "SP1111111111PROVIDER1"
    provider2 = "SP2222222222PROVIDER2"
    owner = "SP1234567890OWNER"
  })
  
  describe("accumulate-fees", () => {
    it("should accumulate fees correctly", () => {
      const result = accumulateFees(contract, tokenA, tokenB, 100, 200)
      
      expect(result.success).toBe(true)
      
      const pairKey = JSON.stringify({ tokenA, tokenB })
      const fees = contract.accumulatedFees.get(pairKey)
      expect(fees.feeA).toBe(100)
      expect(fees.feeB).toBe(200)
      expect(fees.lastUpdate).toBe(contract.blockHeight)
    })
    
    it("should accumulate multiple fee deposits", () => {
      accumulateFees(contract, tokenA, tokenB, 100, 200)
      const result = accumulateFees(contract, tokenA, tokenB, 50, 75)
      
      expect(result.success).toBe(true)
      
      const pairKey = JSON.stringify({ tokenA, tokenB })
      const fees = contract.accumulatedFees.get(pairKey)
      expect(fees.feeA).toBe(150)
      expect(fees.feeB).toBe(275)
    })
  })
  
  describe("get-claimable-fees", () => {
    beforeEach(() => {
      accumulateFees(contract, tokenA, tokenB, 1000, 2000)
    })
    
    it("should calculate claimable fees correctly", () => {
      const providerShares = 500
      const totalShares = 1000
      
      const result = getClaimableFees(contract, tokenA, tokenB, provider1, providerShares, totalShares)
      
      // Provider has 50% of shares, should get 50% of LP fees (80% of total)
      const expectedFeeA = Math.floor((1000 * 8000 * 5000) / (10000 * 10000)) // 400
      const expectedFeeB = Math.floor((2000 * 8000 * 5000) / (10000 * 10000)) // 800
      
      expect(result.claimableA).toBe(expectedFeeA)
      expect(result.claimableB).toBe(expectedFeeB)
    })
    
    it("should return zero for zero shares", () => {
      const result = getClaimableFees(contract, tokenA, tokenB, provider1, 0, 1000)
      
      expect(result.claimableA).toBe(0)
      expect(result.claimableB).toBe(0)
    })
    
    it("should account for already claimed fees", () => {
      const providerShares = 500
      const totalShares = 1000
      
      // Simulate previous claim
      const pairKey = JSON.stringify({ tokenA, tokenB })
      const claimKey = JSON.stringify({ pair: { tokenA, tokenB }, provider: provider1 })
      contract.providerFeeClaims.set(claimKey, {
        claimedA: 200,
        claimedB: 400,
        lastClaim: 900,
      })
      
      const result = getClaimableFees(contract, tokenA, tokenB, provider1, providerShares, totalShares)
      
      expect(result.claimableA).toBe(200) // 400 - 200 already claimed
      expect(result.claimableB).toBe(400) // 800 - 400 already claimed
    })
  })
  
  describe("claim-fees", () => {
    beforeEach(() => {
      accumulateFees(contract, tokenA, tokenB, 1000, 2000)
    })
    
    it("should allow fee claiming", () => {
      const providerShares = 500
      const totalShares = 1000
      
      const result = claimFees(contract, provider1, tokenA, tokenB, providerShares, totalShares)
      
      expect(result.success).toBe(true)
      expect(result.claimable.claimableA).toBeGreaterThan(0)
      expect(result.claimable.claimableB).toBeGreaterThan(0)
      
      // Check that claim was recorded
      const claimKey = JSON.stringify({ pair: { tokenA, tokenB }, provider: provider1 })
      const claim = contract.providerFeeClaims.get(claimKey)
      expect(claim.claimedA).toBe(result.claimable.claimableA)
      expect(claim.claimedB).toBe(result.claimable.claimableB)
    })
    
    it("should reject claim when no fees available", () => {
      const result = claimFees(contract, provider1, tokenA, tokenB, 0, 1000)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_NO_FEES")
    })
  })
  
  describe("distribute-protocol-fees", () => {
    beforeEach(() => {
      accumulateFees(contract, tokenA, tokenB, 1000, 2000)
    })
    
    it("should distribute protocol fees by owner", () => {
      const result = distributeProtocolFees(contract, owner, tokenA, tokenB)
      
      expect(result.success).toBe(true)
      
      const expectedFeeA = Math.floor((1000 * 2000) / 10000) // 200
      const expectedFeeB = Math.floor((2000 * 2000) / 10000) // 400
      
      expect(result.protocolFeeA).toBe(expectedFeeA)
      expect(result.protocolFeeB).toBe(expectedFeeB)
      
      expect(contract.protocolFees.get(tokenA)).toBe(expectedFeeA)
      expect(contract.protocolFees.get(tokenB)).toBe(expectedFeeB)
    })
    
    it("should reject distribution by non-owner", () => {
      const result = distributeProtocolFees(contract, provider1, tokenA, tokenB)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
    
    it("should reject distribution when no fees accumulated", () => {
      const result = distributeProtocolFees(contract, owner, "TOKEN-X", "TOKEN-Y")
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_NO_FEES")
    })
  })
  
  describe("withdraw-protocol-fees", () => {
    beforeEach(() => {
      accumulateFees(contract, tokenA, tokenB, 1000, 2000)
      distributeProtocolFees(contract, owner, tokenA, tokenB)
    })
    
    it("should allow owner to withdraw protocol fees", () => {
      const availableFees = contract.protocolFees.get(tokenA)
      const withdrawAmount = Math.floor(availableFees / 2)
      
      const result = withdrawProtocolFees(contract, owner, tokenA, withdrawAmount)
      
      expect(result.success).toBe(true)
      expect(result.amount).toBe(withdrawAmount)
      expect(contract.protocolFees.get(tokenA)).toBe(availableFees - withdrawAmount)
    })
    
    it("should reject withdrawal by non-owner", () => {
      const result = withdrawProtocolFees(contract, provider1, tokenA, 100)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
    
    it("should reject withdrawal of more than available", () => {
      const availableFees = contract.protocolFees.get(tokenA)
      const excessiveAmount = availableFees + 1000
      
      const result = withdrawProtocolFees(contract, owner, tokenA, excessiveAmount)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_NO_FEES")
    })
  })
})

// Mock contract functions
function accumulateFees(contract, tokenA, tokenB, feeA, feeB) {
  const pairKey = JSON.stringify({ tokenA, tokenB })
  const currentFees = contract.accumulatedFees.get(pairKey) || { feeA: 0, feeB: 0, lastUpdate: 0 }
  
  contract.accumulatedFees.set(pairKey, {
    feeA: currentFees.feeA + feeA,
    feeB: currentFees.feeB + feeB,
    lastUpdate: contract.blockHeight,
  })
  
  return { success: true }
}

function getClaimableFees(contract, tokenA, tokenB, provider, providerShares, totalShares) {
  const pairKey = JSON.stringify({ tokenA, tokenB })
  const accumulated = contract.accumulatedFees.get(pairKey) || { feeA: 0, feeB: 0, lastUpdate: 0 }
  const claimKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  const claimed = contract.providerFeeClaims.get(claimKey) || { claimedA: 0, claimedB: 0, lastClaim: 0 }
  
  if (totalShares === 0) {
    return { claimableA: 0, claimableB: 0 }
  }
  
  const providerPortion = Math.floor((providerShares * 10000) / totalShares)
  const lpFeeA = Math.floor((accumulated.feeA * contract.LIQUIDITY_PROVIDER_SHARE) / 10000)
  const lpFeeB = Math.floor((accumulated.feeB * contract.LIQUIDITY_PROVIDER_SHARE) / 10000)
  const providerFeeA = Math.floor((lpFeeA * providerPortion) / 10000)
  const providerFeeB = Math.floor((lpFeeB * providerPortion) / 10000)
  
  return {
    claimableA: providerFeeA - claimed.claimedA,
    claimableB: providerFeeB - claimed.claimedB,
  }
}

function claimFees(contract, provider, tokenA, tokenB, providerShares, totalShares) {
  const claimable = getClaimableFees(contract, tokenA, tokenB, provider, providerShares, totalShares)
  
  if (claimable.claimableA === 0 && claimable.claimableB === 0) {
    return { success: false, error: "ERR_NO_FEES" }
  }
  
  const claimKey = JSON.stringify({ pair: { tokenA, tokenB }, provider })
  const currentClaimed = contract.providerFeeClaims.get(claimKey) || { claimedA: 0, claimedB: 0, lastClaim: 0 }
  
  contract.providerFeeClaims.set(claimKey, {
    claimedA: currentClaimed.claimedA + claimable.claimableA,
    claimedB: currentClaimed.claimedB + claimable.claimableB,
    lastClaim: contract.blockHeight,
  })
  
  return { success: true, claimable }
}

function distributeProtocolFees(contract, caller, tokenA, tokenB) {
  if (caller !== contract.CONTRACT_OWNER) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  const pairKey = JSON.stringify({ tokenA, tokenB })
  const accumulated = contract.accumulatedFees.get(pairKey)
  
  if (!accumulated) {
    return { success: false, error: "ERR_NO_FEES" }
  }
  
  const protocolFeeA = Math.floor((accumulated.feeA * contract.PROTOCOL_SHARE) / 10000)
  const protocolFeeB = Math.floor((accumulated.feeB * contract.PROTOCOL_SHARE) / 10000)
  
  contract.protocolFees.set(tokenA, (contract.protocolFees.get(tokenA) || 0) + protocolFeeA)
  contract.protocolFees.set(tokenB, (contract.protocolFees.get(tokenB) || 0) + protocolFeeB)
  
  return { success: true, protocolFeeA, protocolFeeB }
}

function withdrawProtocolFees(contract, caller, token, amount) {
  if (caller !== contract.CONTRACT_OWNER) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  const available = contract.protocolFees.get(token) || 0
  
  if (amount > available) {
    return { success: false, error: "ERR_NO_FEES" }
  }
  
  contract.protocolFees.set(token, available - amount)
  return { success: true, amount }
}
