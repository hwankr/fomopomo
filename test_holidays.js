const { holidays } = require('@kyungseopk1m/holidays-kr');

async function test() {
  try {
    console.log('Fetching holidays for 2025...');
    const response = await holidays('2025');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
