import { expect, type Page, type Locator } from '@playwright/test'

// Move in steps and let Sortable's transitions settle before releasing the pointer.
export async function drag(page: Page, source: Locator, target: Locator, x: number, y: number) {
  const start = await source.boundingBox()
  const end = await target.boundingBox()
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
  await page.mouse.down()
  await page.mouse.move(start!.x + start!.width / 2 + 10, start!.y + start!.height / 2, {
    steps: 5,
  })
  await page.mouse.move(end!.x + x, end!.y + y, { steps: 20 })
  await target.evaluate(async (element) => {
    await Promise.allSettled(
      element
        .parentElement!.getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    )
  })
  await page.mouse.move(end!.x + x + 1, end!.y + y, { steps: 2 })
  await page.mouse.up()
}

export async function dragTouch(
  page: Page,
  source: Locator,
  target: Locator,
  x: number,
  y: number,
) {
  const touch = await page.context().newCDPSession(page)
  const start = await source.boundingBox()
  const end = await target.boundingBox()
  const sx = start!.x + start!.width / 2
  const sy = start!.y + start!.height / 2
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: sx, y: sy }],
  })
  await expect(source.locator('..')).toHaveClass(/sortable-chosen/)
  for (let step = 1; step <= 20; step++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: sx + ((end!.x + x - sx) * step) / 20,
          y: sy + ((end!.y + y - sy) * step) / 20,
        },
      ],
    })
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await target.evaluate(async (element) => {
    await Promise.allSettled(
      element
        .parentElement!.getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    )
  })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: end!.x + x + 1, y: end!.y + y }],
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await touch.detach()
}
