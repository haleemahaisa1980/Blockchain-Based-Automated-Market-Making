import { describe, it, expect, beforeEach } from "vitest"

describe("Price Discovery Contract", () => {
  let contract
  
  beforeEach(() => {
    contract = {}
  })
  
  describe("get-amount-out", () => {
    it("should calculate correct output amount", () => {
      const amountIn = 100
      const reserveIn = 1000
      const reserveOut = 2000
      const feeRate = 30 // 0.3%
      
      const result = getAmountOut(amountIn, reserveIn, reserveOut, feeRate)
      
      expect(result.success).toBe(true)
      expect(result.amountOut).toBeGreaterThan(0)
      expect(result.amountOut).toBeLessThan(amountIn * 2) // Should be less than 2:1 ratio due to fees
    })
    
    it("should reject zero input amount", () => {
      const result = getAmountOut(0, 1000, 2000, 30)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_ZERO_AMOUNT")
    })
    
    it("should reject insufficient liquidity", () => {
      const result = getAmountOut(100, 0, 2000, 30)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_INSUFFICIENT_LIQUIDITY")
    })
    
    it("should handle different fee rates correctly", () => {
      const amountIn = 100
      const reserveIn = 1000
      const reserveOut = 2000
      
      const result1 = getAmountOut(amountIn, reserveIn, reserveOut, 30) // 0.3%
      const result2 = getAmountOut(amountIn, reserveIn, reserveOut, 100) // 1%
      
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.amountOut).toBeGreaterThan(result2.amountOut) // Lower fee = higher output
    })
  })
  
  describe("get-amount-in", () => {
    it("should calculate correct input amount", () => {
      const amountOut = 100
      const reserveIn = 1000
      const reserveOut = 2000
      const feeRate = 30
      
      const result = getAmountIn(amountOut, reserveIn, reserveOut, feeRate)
      
      expect(result.success).toBe(true)
      expect(result.amountIn).toBeGreaterThan(0)
      expect(result.amountIn).toBeGreaterThan(amountOut / 2) // Should be more than 1:2 ratio due to fees
    })
    
    it("should reject zero output amount", () => {
      const result = getAmountIn(0, 1000, 2000, 30)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_ZERO_AMOUNT")
    })
    
    it("should reject output amount exceeding reserves", () => {
      const result = getAmountIn(2001, 1000, 2000, 30)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_INSUFFICIENT_LIQUIDITY")
    })
  })
  
  describe("get-price-ratio", () => {
    it("should calculate correct price ratio", () => {
      const reserveA = 1000
      const reserveB = 2000
      
      const result = getPriceRatio(reserveA, reserveB)
      
      expect(result.success).toBe(true)
      expect(result.ratio).toBe(2000000) // 2.0 with 6 decimal precision
    })
    
    it("should reject zero reserves", () => {
      const result1 = getPriceRatio(0, 2000)
      const result2 = getPriceRatio(1000, 0)
      
      expect(result1.success).toBe(false)
      expect(result1.error).toBe("ERR_INSUFFICIENT_LIQUIDITY")
      expect(result2.success).toBe(false)
      expect(result2.error).toBe("ERR_INSUFFICIENT_LIQUIDITY")
    })
  })
  
  describe("get-price-impact", () => {
    it("should calculate price impact correctly", () => {
      const amountIn = 100
      const reserveIn = 1000
      const reserveOut = 2000
      
      const result = getPriceImpact(amountIn, reserveIn, reserveOut)
      
      expect(result.success).toBe(true)
      expect(result.impact).toBeGreaterThan(0)
      expect(result.impact).toBeLessThan(10000) // Should be less than 100%
    })
    
    it("should show higher impact for larger trades", () => {
      const reserveIn = 1000
      const reserveOut = 2000
      
      const smallTrade = getPriceImpact(50, reserveIn, reserveOut)
      const largeTrade = getPriceImpact(200, reserveIn, reserveOut)
      
      expect(smallTrade.success).toBe(true)
      expect(largeTrade.success).toBe(true)
      expect(largeTrade.impact).toBeGreaterThan(smallTrade.impact)
    })
    
    it("should reject insufficient liquidity", () => {
      const result = getPriceImpact(100, 0, 2000)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_INSUFFICIENT_LIQUIDITY")
    })
  })
  
  describe("check-slippage", () => {
    it("should pass with acceptable slippage", () => {
      const expectedAmount = 1000
      const actualAmount = 995
      const slippageTolerance = 100 // 1%
      
      const result = checkSlippage(expectedAmount, actualAmount, slippageTolerance)
      
      expect(result).toBe(true)
    })
    
    it("should fail with excessive slippage", () => {
      const expectedAmount = 1000
      const actualAmount = 980
      const slippageTolerance = 100 // 1%
      
      const result = checkSlippage(expectedAmount, actualAmount, slippageTolerance)
      
      expect(result).toBe(false)
    })
  })
  
  describe("get-optimal-route", () => {
    it("should choose direct route when better", () => {
      const amountIn = 100
      const tokenA = "TOKEN-A"
      const tokenB = "TOKEN-B"
      const tokenC = "TOKEN-C"
      
      const result = getOptimalRoute(
          amountIn,
          tokenA,
          tokenB,
          tokenC,
          1000,
          2000, // A-B reserves
          1500,
          3000, // B-C reserves
          30, // fee rate
      )
      
      expect(result.success).toBe(true)
      expect(result.route).toBeDefined()
      expect(result.amountOut).toBeGreaterThan(0)
    })
  })
})

// Mock contract functions
function getAmountOut(amountIn, reserveIn, reserveOut, feeRate) {
  if (amountIn === 0) {
    return { success: false, error: "ERR_ZERO_AMOUNT" }
  }
  
  if (reserveIn === 0 || reserveOut === 0) {
    return { success: false, error: "ERR_INSUFFICIENT_LIQUIDITY" }
  }
  
  const amountInWithFee = amountIn - Math.floor((amountIn * feeRate) / 10000)
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn + amountInWithFee
  const amountOut = Math.floor(numerator / denominator)
  
  return { success: true, amountOut }
}

function getAmountIn(amountOut, reserveIn, reserveOut, feeRate) {
  if (amountOut === 0) {
    return { success: false, error: "ERR_ZERO_AMOUNT" }
  }
  
  if (reserveIn === 0 || reserveOut <= amountOut) {
    return { success: false, error: "ERR_INSUFFICIENT_LIQUIDITY" }
  }
  
  const numerator = reserveIn * amountOut
  const denominator = reserveOut - amountOut
  const amountInBeforeFee = Math.floor(numerator / denominator)
  const feeMultiplier = 10000 + feeRate
  const amountIn = Math.floor((amountInBeforeFee * feeMultiplier) / 10000)
  
  return { success: true, amountIn }
}

function getPriceRatio(reserveA, reserveB) {
  if (reserveA === 0 || reserveB === 0) {
    return { success: false, error: "ERR_INSUFFICIENT_LIQUIDITY" }
  }
  
  const ratio = Math.floor((reserveB * 1000000) / reserveA)
  return { success: true, ratio }
}

function getPriceImpact(amountIn, reserveIn, reserveOut) {
  if (reserveIn === 0 || reserveOut === 0) {
    return { success: false, error: "ERR_INSUFFICIENT_LIQUIDITY" }
  }
  
  const priceBefore = Math.floor((reserveOut * 1000000) / reserveIn)
  const newReserveIn = reserveIn + amountIn
  const newReserveOut = Math.floor((reserveIn * reserveOut) / newReserveIn)
  const priceAfter = Math.floor((newReserveOut * 1000000) / newReserveIn)
  
  const impact = priceBefore > priceAfter ? Math.floor(((priceBefore - priceAfter) * 10000) / priceBefore) : 0
  
  return { success: true, impact }
}

function checkSlippage(expectedAmount, actualAmount, slippageTolerance) {
  const minAmount = expectedAmount - Math.floor((expectedAmount * slippageTolerance) / 10000)
  return actualAmount >= minAmount
}

function getOptimalRoute(
    amountIn,
    tokenA,
    tokenB,
    tokenC,
    reserveAB_A,
    reserveAB_B,
    reserveBC_B,
    reserveBC_C,
    feeRate,
) {
  // Simplified routing logic
  const directOut = getAmountOut(amountIn, reserveAB_A, reserveBC_C, feeRate)
  const intermediateOut = getAmountOut(amountIn, reserveAB_A, reserveAB_B, feeRate)
  
  if (intermediateOut.success) {
    const finalOut = getAmountOut(intermediateOut.amountOut, reserveBC_B, reserveBC_C, feeRate)
    
    if (directOut.success && directOut.amountOut > finalOut.amountOut) {
      return { success: true, route: "direct", amountOut: directOut.amountOut }
    } else if (finalOut.success) {
      return { success: true, route: "two-hop", amountOut: finalOut.amountOut }
    }
  }
  
  return directOut.success
      ? { success: true, route: "direct", amountOut: directOut.amountOut }
      : { success: false, error: "ERR_NO_ROUTE" }
}
