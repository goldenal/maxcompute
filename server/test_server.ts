import http from 'http';

const mockFigmaData = {
    id: '1:2',
    name: 'Button',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'FIXED',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
    itemSpacing: 8,
    fills: [{ type: 'SOLID', color: { r: 0.094, g: 0.627, b: 0.984 } }],
    children: [
        {
            id: '1:3',
            name: 'Label',
            type: 'TEXT',
            characters: 'Click Me',
            fontSize: 14,
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
        },
    ],
};

const data = JSON.stringify({ figmaData: mockFigmaData });

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/convert',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
    },
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
