#include "position.hpp"

#include <algorithm>

namespace connect5 {

namespace {
constexpr std::array<int, 4> shifts{1, stride, stride - 1, stride + 1};
constexpr std::array<int, cols> order{4, 3, 5, 2, 6, 1, 7, 0, 8};
}

bool aligned(Bits stones) {
  for (int shift : shifts) {
    Bits run = stones;
    for (int i = 1; i < connect; ++i) run &= stones >> (shift * i);
    if (run) return true;
  }
  return false;
}

std::optional<Position> Position::from_moves(const std::string& moves) {
  Position position;
  for (char value : moves) {
    if (value < '1' || value > '9' || !position.play(value - '1')) return std::nullopt;
  }
  return position;
}

bool Position::can_play(int column) const {
  return column >= 0 && column < cols && height[column] < rows && !won(0) && !won(1);
}

bool Position::play(int column) {
  if (!can_play(column)) return false;
  player[turn] |= Bits{1} << (column * stride + height[column]);
  ++height[column];
  ++ply;
  turn ^= 1;
  return true;
}

bool Position::won(int side) const {
  return side >= 0 && side < 2 && aligned(player[side]);
}

bool Position::full() const {
  return ply == cols * rows;
}

std::vector<int> Position::legal_moves() const {
  std::vector<int> moves;
  for (int column : order) if (can_play(column)) moves.push_back(column);
  return moves;
}

Position Position::mirrored() const {
  Position result;
  result.turn = turn;
  result.ply = ply;
  for (int column = 0; column < cols; ++column) {
    int target = cols - 1 - column;
    result.height[target] = height[column];
    for (int row = 0; row < rows; ++row) {
      Bits source = Bits{1} << (column * stride + row);
      Bits destination = Bits{1} << (target * stride + row);
      for (int side = 0; side < 2; ++side) if (player[side] & source) result.player[side] |= destination;
    }
  }
  return result;
}

Key Position::key() const {
  Key raw{player[turn], player[0] | player[1]};
  Position reflected = mirrored();
  Key reflected_key{reflected.player[reflected.turn], reflected.player[0] | reflected.player[1]};
  return std::min(raw, reflected_key);
}

std::string encode(Bits value) {
  if (!value) return "0";
  std::string result;
  while (value) {
    int digit = value & 15;
    result.push_back("0123456789abcdef"[digit]);
    value >>= 4;
  }
  std::reverse(result.begin(), result.end());
  return result;
}

}
