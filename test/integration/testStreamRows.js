/*
 * Copyright (c) 2015-2019 Snowflake Computing Inc. All rights reserved.
 */
var assert = require('assert');
var testUtil = require('./testUtil');
require('events').EventEmitter.prototype._maxListeners = 100;

describe('Test Steam Rows API', function ()
{
  var connection;

  before(function (done)
  {
    connection = testUtil.createConnection();
    testUtil.connect(connection, done);
  });

  after(function (done)
  {
    testUtil.destroyConnection(connection, done);
  });

  it('testInvalidStatement', function (done)
  {
    connection.execute({
      sqlText: 'select aaa from b aaa',
      complete: function (err, stmt)
      {
        var stream = stmt.streamRows();
        stream.on('data', function ()
        {
          assert.ok(false);
        });
        stream.on('error', function (err)
        {
          assert.strictEqual(err.code, '002003');
          done();
        });
      }
    });
  });

  it('testStartEndIndexForFlowingMode', function (done)
  {
    connection.execute({
      sqlText: 'select randstr(10, random()) from table(generator(rowcount=>30000))',
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var rowCount = 0;
        var flowingStream = stmt.streamRows({
          start: 200,
          end: 300
        });
        flowingStream.on('data', function ()
        {
          rowCount++;
        }).on('end', function ()
        {
          assert.strictEqual(rowCount, 101);
          done();
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        });
      }
    })
  });

  it('testStartEndIndexForNonFlowingMode', function (done)
  {
    connection.execute({
      sqlText: 'select randstr(10, random()) from table(generator(rowcount=>30000))',
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var rowCount = 0;
        var nonFlowingStream = stmt.streamRows({
          start: 200,
          end: 300
        });
        nonFlowingStream.on('readable', function ()
        {
          while (nonFlowingStream.read() !== null)
          {
            rowCount++;
          }
        }).on('end', function ()
        {
          assert.strictEqual(rowCount, 101);
          done();
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        });
      }
    })
  });

  it('testEmptyResultSet', function (done)
  {
    connection.execute({
      sqlText: "select randstr(10, random()) c1 from table(generator(rowcount=>10)) where c1='abc'",
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var completedStream = 0;
        var flowingStream = stmt.streamRows();
        flowingStream.on('data', function ()
        {
          assert.ok(false);
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        }).on('end', function ()
        {
          if (++completedStream == 2)
          {
            done();
          }
        });

        var nonFlowingStream = stmt.streamRows();
        nonFlowingStream.on('readable', function ()
        {
          assert.strictEqual(nonFlowingStream.read(), null);
        }).on('end', function ()
        {
          if (++completedStream == 2)
          {
            done();
          }
        }).on('error', function ()
        {
          testUtil.checkError(err);
        });

      }
    })
  });

  it('testSmallResultSet', function (done)
  {
    var expected =
      [
        {
          COLUMN1: '1',
          COLUMN2: '36901',
          COLUMN3: 'O',
          COLUMN4: '173665.47',
          COLUMN5: '1996-01-02',
          COLUMN6: '5-LOW',
          COLUMN7: 'Clerk#000000951',
          COLUMN8: '0',
          COLUMN9: 'nstructions sleep furiously among '
        },
        {
          COLUMN1: '100',
          COLUMN2: '147004',
          COLUMN3: 'O',
          COLUMN4: '187782.63',
          COLUMN5: '1998-02-28',
          COLUMN6: '4-NOT SPECIFIED',
          COLUMN7: 'Clerk#000000577',
          COLUMN8: '0',
          COLUMN9: 'heodolites detect slyly alongside of the ent'
        },
        {
          COLUMN1: '100000',
          COLUMN2: '97549',
          COLUMN3: 'F',
          COLUMN4: '114318.00',
          COLUMN5: '1992-05-27',
          COLUMN6: '3-MEDIUM',
          COLUMN7: 'Clerk#000000725',
          COLUMN8: '0',
          COLUMN9: 'the carefully silent'
        }
      ];

    var values = [];
    expected.forEach(function (entry)
    {
      var value = [];
      for (var e in entry)
      {
        var v = entry[e];
        value.push("'" + v + "'");
      }
      values.push("(" + value.join(',') + ")");
    });
    var sql = 'select * from values' + values.join(',');
    connection.execute({
      sqlText: sql,
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var completedStream = 0;
        var flowingStream = stmt.streamRows();
        var flowingModeResult = [];
        flowingStream.on('data', function (row)
        {
          flowingModeResult.push(row);
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        }).on('end', function ()
        {
          assert.deepStrictEqual(flowingModeResult, expected);
          if (++completedStream == 2)
          {
            done();
          }
        });

        var nonFlowingModeResult = [];
        var nonFlowingStream = stmt.streamRows();
        nonFlowingStream.on('readable', function ()
        {
          var row;
          while ((row = nonFlowingStream.read()) !== null)
          {
            nonFlowingModeResult.push(row);
          }
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        }).on('end', function ()
        {
          assert.deepStrictEqual(nonFlowingModeResult, expected);
          if (++completedStream == 2)
          {
            done();
          }
        });
      }
    })
  });

  it('testMultipleStream', function (done)
  {
    const sourceRowCount = 30000;
    connection.execute({
      sqlText: 'select true from table(generator(rowcount=>' + sourceRowCount + '))',
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var streamQueue = [];
        var completedStream = 0;
        for (var i = 0; i < 20; i++)
        {
          streamQueue.push(stmt.streamRows());
        }

        var flowingStreamRegister = function (stream)
        {
          var rowCount = 0;
          stream.on('data', function ()
          {
            rowCount++;
          }).on('error', function (err)
          {
            assert.strictEqual(err);
          }).on('end', function ()
          {
            assert.strictEqual(rowCount, sourceRowCount);
            if (++completedStream == 20)
            {
              done();
            }
          });
        };

        for (i = 0; i < 20; i++)
        {
          flowingStreamRegister(streamQueue[i]);
        }
      }
    })
  });

  it('testPauseAndResumeFlowingStream', function (done)
  {
    const sourceRowCount = 30000;
    connection.execute({
      sqlText: 'select true from table(generator(rowcount=>' + sourceRowCount + '))',
      complete: function (err, stmt)
      {
        testUtil.checkError(err);
        var rowCount = 0;
        var stream = stmt.streamRows();
        stream.on('data', function ()
        {
          rowCount++;
        }).on('error', function (err)
        {
          testUtil.checkError(err);
        }).on('end', function ()
        {
          assert.strictEqual(rowCount, sourceRowCount);
          done();
        });

        setTimeout(function ()
        {
          stream.pause();
        }, 200);

        setTimeout(function ()
        {
          stream.resume();
        }, 300);
      }
    });
  });

  /*it('testPipeIntoFile', function(done)
  {
    connection.execute({
      sqlText: 'select * from orders order by c1',
      complete: function(err, stmt)
      {
        testUtil.checkError(err);
        var stream = stmt.streamRows();
        var outputFileName = process.env.SF_PROJECT_ROOT + '/Node/nodejsDriverTest/output.txt';
        var writableStream = fs.createWriteStream(outputFileName);
        var jsonStream = through2.obj(function(chunk, encoding, callback) {
          this.push(JSON.stringify(chunk, null, 4) + '\n');
          callback()
        });
        stream.pipe(jsonStream).pipe(writableStream);
        stream.on('end', function()
        {
          function checksum (str, algorithm, encoding) {
            return crypto
              .createHash(algorithm || 'md5')
              .update(str, 'utf8')
              .digest(encoding || 'hex')
          }
          fs.readFile(outputFileName, function(err, data)
          {
            testUtil.checkError(err);
            assert.strictEqual(checksum(data), '52d6d6c7de1e882e448d5e615e6c2264');
            done();
          })
        });
      }
    });
  });*/
});
